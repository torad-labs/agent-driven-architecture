# Transcript — Chat API wire models (kotlinx.serialization)

## Task

Design `@Serializable` polymorphic wire models (`text`, `tool_call`, `tool_result`)
and the `Json` configuration for a chat API shared between an Android app and a
Kotlin Multiplatform module, such that:

1. Old clients don't crash when the server adds **new fields**.
2. Polymorphic types **round-trip correctly** over the wire.
3. **Renaming a Kotlin class never breaks** the JSON.

## Skill used

`/home/marcos/.claude/skills/kotlin-best-practices/SKILL.md` — writing mode,
followed by a quick review-mode self-pass.

## Tiers classified

| Tier | Applies? | Why |
|---|---|---|
| **0 — Core** | ✅ | Any Kotlin. The **Serialization** block is the spine of this task. |
| **1 — Published API** | ✅ | Models are **compiled against by other modules** (Android app + KMP module share them). `explicitApi`-style discipline applies to the shared surface; data-class-growth caveat is relevant. |
| **2 — Multiplatform** | ✅ | Explicitly shared with a **KMP module** → these live in `commonMain`; no platform symbols allowed. |
| **3 — Publishing & iOS** | ❌ | No Maven Central / Swift-consumption mentioned. Per the skill's own guidance, not raising publishing/XCFramework/SKIE concerns avoids noise. |

Reference blocks loaded: `references/core-kotlin.md` (Serialization, Ergonomics,
Testing), `references/library-and-api.md` (API & Binary Compat), and
`references/multiplatform.md`.

## Key serialization decisions (rule → decision → why)

| Requirement | Rule | Decision |
|---|---|---|
| New fields don't crash old clients | core §5 | **Per-class `@JsonIgnoreUnknownKeys`** on every inbound model, NOT the global `ignoreUnknownKeys` flag. Keeps leniency scoped to inbound types; request/strict models elsewhere can still reject typos. (Annotation does not propagate into nested types — repeated on `ToolCallArguments`.) |
| New **message types** don't crash | core §6 | Polymorphic **`defaultDeserializer { UnknownMessage.serializer() }`** registered in the `SerializersModule`. An unknown `type` decodes to a typed `UnknownMessage` capturing the raw discriminator, instead of throwing `Serializer for subclass not found`. |
| New **enum values** don't crash | core §6 (enum analogue) | `coerceInputValues = true` **plus a `= …UNKNOWN` default on every enum wire field**. (See "bug found by running" — coercion needs a default.) |
| Polymorphic round-trip | core §2, §3, §4 | `@SerialName` on every subtype; `@JsonClassDiscriminator("type")` set **once** on the `sealed interface Message` base; encode/decode through the **static base type** (`encodeToString<Message>(...)`) so the discriminator is written. |
| Renaming a class never breaks JSON | core §2 | Every subtype pins its wire value with **`@SerialName("text"/"tool_call"/"tool_result")`** + `@SerialName` on every enum constant. Wire format is decoupled from FQ class names, so a Kotlin rename is invisible to the server. |
| Idempotent round-trip | core §7 | Kept **`explicitNulls = true`** (the default). `output: String?` stays `null` through encode→decode; nullable-with-default used as the "absent" signal (Ergonomics §2), never a sentinel. |
| One reused codec | core §1 | Single top-level **`val WireJson: Json`**; never `Json { }` per message (descriptor cache). |
| Sealed exhaustiveness | Ergonomics §4 | `Message` is a `sealed interface`; the example `when` has **no `else`**, so a future variant we author is a compile error at every handler. |
| KMP `commonMain` purity | multiplatform §2 | Zero platform symbols — only kotlinx-serialization + stdlib (`JsonElement`, `Map`, `String`), all of which ship for every target. |
| Documented surface | Ergonomics §6 | KDoc on every public type explaining the *why* (since it's a Tier-1 shared surface). |

### Tier-1 honesty note (data-class growth)

`library-and-api §5` warns that a **public `data class` must not grow** (added
property → changed constructor/`copy` descriptors → binary break for already-
compiled callers). These wire models are `data class`es because value semantics +
`copy` + structural equality are exactly right for DTOs, and the *wire* contract
explicitly expects growth.

I resolved the tension by pushing the growth axis **into the payload, not the
class shape**: `ToolCallArguments` wraps a `Map<String, JsonElement>`, so new
tool parameters and new tools need **no source change** to the shared types.
When a top-level message type genuinely must gain a *typed* field later, the
binary-safe move is a new overload/type, not appending a constructor param — this
is recorded here as the deliberate decision the skill asks for, rather than left
implicit.

## Verification — compiled AND run (not just compiled)

Kotlin **2.3.21** + bundled `kotlin-serialization-compiler-plugin.jar` +
kotlinx-serialization **1.11.0** (core+json jvm). `@JsonIgnoreUnknownKeys`
requires 1.8.0+ — satisfied.

- `kotlinc-jvm` compile of all three files: **exit 0, no warnings.**
- Runtime harness (`java`) exercised all five behaviors and **all assertions passed**:
  - unknown field `reactions` on `text` → dropped;
  - unknown type `tool_call_v2` → `UnknownMessage(rawType=tool_call_v2)`;
  - unknown enum `developer` → `Role.UNKNOWN`;
  - discriminator `"type":"text"` present in output;
  - `output=null` exact round-trip.

### Bug found by running (the payoff of core Testing §5 — run, don't just compile)

First run **threw** `Role does not contain element with name 'developer'`.
Root cause: `coerceInputValues` only coerces an out-of-range value to the
property's **default**, and `role` had no default. Fix: declared
`role: Role = Role.UNKNOWN` (and confirmed `status` already had its default).
A compile-only check would have shipped this latent crash. The gotcha is now
documented inline in `ChatWireJson.kt`.

## Deliverables

- `outputs/ChatWireModels.kt` — sealed `Message` hierarchy + subtypes + enums + `UnknownMessage` fallback.
- `outputs/ChatWireJson.kt` — the single shared `WireJson` codec with the polymorphic default + forward-compat flags.
- `outputs/ChatWireUsage.kt` — encode/decode-through-base-type examples + a runnable forward-compat demonstration.
