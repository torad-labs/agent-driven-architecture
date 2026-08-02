package com.example.chat.wire

import kotlinx.serialization.encodeToString

/**
 * Usage examples for the chat wire models. Pure `commonMain` code — no platform
 * symbols, runs identically on Android (JVM) and every KMP target.
 *
 * The load-bearing rule demonstrated here: **encode and decode polymorphic
 * values through the static base type [Message], never a concrete subtype.** The
 * `"type"` discriminator is only written when the compile-time type is the base;
 * serializing through `TextMessage` directly omits the discriminator and yields
 * a payload no client can decode back polymorphically. [core-kotlin
 * Serialization §4]
 */
public object ChatWireUsage {

    /**
     * Encode a single message. Note the explicit `<Message>` type argument so
     * the discriminator is emitted, even though the runtime value is a
     * [TextMessage].
     */
    public fun encodeOne(message: Message): String =
        WireJson.encodeToString<Message>(message)

    /** Encode a list of messages — element static type is [Message]. */
    public fun encodeMany(messages: List<Message>): String =
        WireJson.encodeToString<List<Message>>(messages)

    /** Decode a single message; unknown `type`s arrive as [UnknownMessage]. */
    public fun decodeOne(json: String): Message =
        WireJson.decodeFromString<Message>(json)

    /** Decode a list of messages. */
    public fun decodeMany(json: String): List<Message> =
        WireJson.decodeFromString<List<Message>>(json)

    /**
     * Demonstrates the three forward-compat guarantees in one decode:
     *
     *  1. **Unknown field** (`"reactions"`) on a known type → dropped, no crash
     *     (per-class `@JsonIgnoreUnknownKeys`).
     *  2. **Unknown enum value** is not shown here but `role:"developer"` would
     *     coerce to [Role.UNKNOWN] (`coerceInputValues`).
     *  3. **Unknown message type** (`"tool_call_v2"`) → [UnknownMessage] with
     *     `rawType == "tool_call_v2"` (polymorphic `defaultDeserializer`).
     *
     * @return a human-readable summary of what was decoded, for the doc/example.
     */
    public fun decodeForwardCompatExample(): String {
        val futureServerPayload = """
            [
              {
                "type": "text",
                "id": "m1",
                "role": "user",
                "content": "hi",
                "reactions": ["👍"]
              },
              {
                "type": "tool_call_v2",
                "id": "m2",
                "tool_name": "search",
                "fancy_new_field": 42
              }
            ]
        """.trimIndent()

        val messages = decodeMany(futureServerPayload)

        return messages.joinToString("\n") { msg ->
            when (msg) {
                is TextMessage -> "text(${msg.id}): ${msg.content}"
                is ToolCallMessage -> "tool_call(${msg.id}): ${msg.toolName}"
                is ToolResultMessage -> "tool_result(${msg.id}): ${msg.status}"
                is UnknownMessage -> "unknown(${msg.id}): rawType=${msg.rawType}"
                // No `else`: Message is sealed, so adding a variant we author is
                // a compile error here. [core-kotlin Ergonomics §4]
            }
        }
    }

    /**
     * Round-trip proof: encode through [Message], decode back, structural
     * equality holds (the payoff of `explicitNulls = true`). In a real module
     * this would be a golden/approval test through the production codec rather
     * than an example. [core-kotlin Testing §5]
     */
    public fun roundTrips(message: Message): Boolean =
        decodeOne(encodeOne(message)) == message
}
