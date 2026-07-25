# Transcript — Polymorphic chat wire models (kotlinx.serialization)

## Task

Design `@Serializable` wire models + `Json` config for a polymorphic chat API
(`text`, `tool_call`, `tool_result`, with the server adding more types/fields
over time), shared between an Android app and a KMP module, such that:

1. Old clients don't crash when the server adds new **fields**.
2. The polymorphic types **round-trip** correctly over the wire.
3. **Renaming a Kotlin class** never breaks the JSON.

## Approach / reasoning

I mapped each requirement to a specific kotlinx.serialization mechanism rather
than reaching for anything custom:

| Requirement | Mechanism |
|---|---|
| New fields don't crash old clients | `Json { ignoreUnknownKeys = true }` |
| New **types** don't crash old clients | polymorphic `defaultDeserializer { }` → `UnknownMessage` capturing raw JSON |
| Polymorphic round-trip | `sealed interface ChatMessage` + JSON `classDiscriminator = "type"` |
| Rename a class/property safely | `@SerialName` pinned on **every** type tag and field key |
| Smaller, symmetric payloads | `encodeDefaults = false` + defaults on new/optional fields |

Key design decisions:

- **Sealed interface, not sealed class.** Gives exhaustive `when` at the call
  site and lets kotlinx generate the polymorphic serializer automatically. Each
  subtype is a `data class` (value equality → makes round-trip assertions and
  diffing trivial).
- **Discriminator stated explicitly** (`classDiscriminator = "type"`) even
  though `"type"` is kotlinx's current default — so a future default change in
  the library can't silently move our wire contract.
- **`UnknownMessage` fallback.** This is the type-level analogue of
  `ignoreUnknownKeys`. The server team "keeps adding new message types"; without
  a polymorphic default deserializer, an unknown `type` throws
  `SerializationException` and breaks old clients. The fallback captures the
  discriminator + the full raw `JsonObject` so the message can be logged,
  rendered generically, or relayed forward untouched. It's deserialize-only by
  design (we never *produce* unknown messages locally).
- **`arguments` as `JsonObject`** rather than over-modeling each tool's schema —
  tool args are schema-per-tool free-form JSON. Defaulted to empty so older
  payloads without the key still decode.
- **New `is_error` field** on `ToolResultMessage` has a default (`false`), so old
  payloads decode and new clients reading old data get a sane fallback —
  demonstrating the backward/forward-compat field pattern end to end.
- **One shared `Json` instance** (`ChatJson`) — thread-safe, caches serializers,
  used by both Android and the KMP module. Constructing `Json {}` per call is a
  common perf footgun; avoided.
- **KMP placement:** the code uses only `kotlinx-serialization-core` and
  `-json` common APIs — no JVM-only types — so all three files live in
  `commonMain` and compile unchanged for Android + iOS.

## Implementation notes / corrections during build

1. First compile failed: `ChatMessage.serializer()` unresolved. Cause: I hadn't
   enabled the `kotlinx-serialization` **compiler plugin** — `-include-runtime`
   does not turn it on. Fixed by passing
   `-Xplugin=<kotlin-home>/lib/kotlinx-serialization-compiler-plugin.jar`.
2. Wrong API name: I'd written the (non-existent here) top-level
   `polymorphicDefaultDeserializer(...)`. Inspecting the 1.7.3 jar
   (`javap kotlinx.serialization.modules.PolymorphicModuleBuilder`) showed the
   correct member is `defaultDeserializer { discriminator -> ... }` inside the
   `polymorphic(ChatMessage::class) { }` block. Fixed.
3. The unknown-type fallback is implemented with a small
   `DeserializationStrategy<ChatMessage>` that delegates to
   `JsonObject.serializer()` to re-read the whole body, then wraps it in
   `UnknownMessage` (extracting `type` from the object, falling back to the
   discriminator kotlinx passes in).

## Verification (all run against real kotlinx-serialization 1.7.3 / Kotlin 2.3.21 / JDK 21)

Compiled with the serialization plugin → clean. `main()` output:

```
Encoded conversation:
[{"type":"text","text":"What's the weather in Tokyo?"},{"type":"tool_call","id":"call_1","name":"get_weather","arguments":{"city":"Tokyo","units":"celsius"}},{"type":"tool_result","tool_call_id":"call_1","output":"18°C, clear"},{"type":"tool_result","tool_call_id":"call_2","output":"rate limited","is_error":true}]

Round-trip OK: each subtype came back as its concrete Kotlin class.
  text: What's the weather in Tokyo?
  tool_call: get_weather -> {"city":"Tokyo","units":"celsius"}
  tool_result: 18°C, clear (error=false)
  tool_result: rate limited (error=true)

Unknown FIELD tolerated: TextMessage(text=hi)
Unknown TYPE captured: UnknownMessage(type=image, raw={"type":"image","url":"https://cdn/img.png","alt":"a cat"})

All checks passed.
```

Observed in that output:
- Discriminator `"type"` emitted; every subtype decoded back to its concrete class (`decoded == conversation`).
- `encodeDefaults = false` omitted `is_error` on the first result, kept `is_error:true` on the second.
- Future text message with `rendered_html`/`ts` → decoded fine, unknown fields dropped (no crash).
- Future `image` type → captured as `UnknownMessage` with raw JSON preserved (no crash).

Separate **rename proof** — renamed the class `TextMessage → ChatText` AND the
property `text → body`, kept `@SerialName("text")` on both:

```
Rename test passed: class ChatText / property body still bind JSON key 'text'. out={"text":"hi"}
```

→ Confirms the wire bytes are bound to the `@SerialName` strings, not the Kotlin
identifiers, so renames are safe.

## Files

- `outputs/ChatWireModels.kt` — sealed `ChatMessage` + `TextMessage`,
  `ToolCallMessage`, `ToolResultMessage`, `UnknownMessage`. All `@SerialName`-pinned.
- `outputs/ChatJson.kt` — the shared `ChatJson` instance, the unknown-type
  fallback deserializer, and encode/decode helpers (single + list).
- `outputs/UsageExample.kt` — runnable `main()` exercising all three goals.

## Caveats / things a reviewer should know

- `UnknownMessage` re-encoding: if you ever need to relay an unknown message
  *back* to the server byte-for-byte, encode its `raw` `JsonElement` directly
  rather than re-serializing the `UnknownMessage` wrapper (the wrapper's
  `@SerialName("__unknown__")` is a local marker, not a real wire type).
- For a long-lived public wire contract, consider also dumping an ABI/`.api`
  file and keeping the `@SerialName` strings under review-lock so nobody changes
  a tag thinking it's "just a rename."
```
