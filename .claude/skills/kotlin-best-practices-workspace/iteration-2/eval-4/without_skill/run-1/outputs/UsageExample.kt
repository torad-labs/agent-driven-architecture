@file:OptIn(ExperimentalSerializationApi::class)

package com.example.chat.wire

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Runnable demonstration of the three design goals. This is illustrative — in
 * the real app these calls happen inside your network/repository layer.
 */
public fun main() {
    // ---- 1. Polymorphic round-trip ----------------------------------------
    val conversation: List<ChatMessage> = listOf(
        TextMessage(text = "What's the weather in Tokyo?"),
        ToolCallMessage(
            id = "call_1",
            name = "get_weather",
            arguments = buildJsonObject {
                put("city", "Tokyo")
                put("units", "celsius")
            },
        ),
        ToolResultMessage(
            toolCallId = "call_1",
            output = "18°C, clear",
        ),
        ToolResultMessage(
            toolCallId = "call_2",
            output = "rate limited",
            isError = true,
        ),
    )

    val wire = encodeConversation(conversation)
    println("Encoded conversation:")
    println(wire)

    val decoded = decodeConversation(wire)
    check(decoded == conversation) { "round-trip must be loss-free" }
    println("\nRound-trip OK: each subtype came back as its concrete Kotlin class.")
    decoded.forEach { msg ->
        when (msg) {
            is TextMessage -> println("  text: ${msg.text}")
            is ToolCallMessage -> println("  tool_call: ${msg.name} -> ${msg.arguments}")
            is ToolResultMessage -> println("  tool_result: ${msg.output} (error=${msg.isError})")
            is UnknownMessage -> println("  unknown(${msg.type}): ${msg.raw}")
        }
    }

    // ---- 2. Old client, NEW FIELD on a known type -------------------------
    // Server added "rendered_html" and "ts" to a text message in a later
    // version. This old client doesn't model them — and doesn't crash.
    val futureText = """
        { "type": "text", "text": "hi", "rendered_html": "<b>hi</b>", "ts": 1717000000 }
    """.trimIndent()
    val t = decodeChatMessage(futureText)
    println("\nUnknown FIELD tolerated: $t")
    check(t is TextMessage && t.text == "hi")

    // ---- 3. Old client, NEW MESSAGE TYPE ----------------------------------
    // Server invented "image" messages. This old build has never heard of them,
    // yet decoding succeeds and the raw payload is preserved for logging /
    // generic display / forward relaying.
    val futureType = """
        { "type": "image", "url": "https://cdn/img.png", "alt": "a cat" }
    """.trimIndent()
    val u = decodeChatMessage(futureType)
    println("Unknown TYPE captured: $u")
    check(u is UnknownMessage && u.type == "image")

    // ---- 4. Rename safety (compile-time observation) -----------------------
    // Every wire tag/key is pinned with @SerialName. You may rename TextMessage
    // -> ChatText, or its `text` property -> `body`, and this JSON still parses:
    //     { "type": "text", "text": "..." }
    // because the bytes are bound to the @SerialName strings, not the Kotlin
    // identifiers. (Nothing to run here — it's a guarantee of the annotations.)
    println("\nAll checks passed.")
}
