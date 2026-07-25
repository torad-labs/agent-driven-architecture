@file:OptIn(ExperimentalSerializationApi::class)

package com.example.chat.wire

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Polymorphic wire models for the chat API.
 *
 * Design goals (all three baked in below):
 *
 *  1. Forward compatibility on *fields*: old clients must not crash when the
 *     server adds new JSON keys. Handled by [ChatJson] via `ignoreUnknownKeys`.
 *
 *  2. Forward compatibility on *types*: old clients must not crash when the
 *     server adds a brand-new message `type` we don't know about. Handled by
 *     [UnknownMessage] + a polymorphic default deserializer registered in
 *     [ChatJson].
 *
 *  3. Round-trip + rename safety: the sealed hierarchy serializes
 *     polymorphically via a JSON discriminator, and EVERY type tag and EVERY
 *     field key is pinned with [SerialName]. Renaming a Kotlin class or a
 *     Kotlin property therefore never changes the bytes on the wire.
 *
 * Wire shape (discriminator key is "type", configured in [ChatJson]):
 *
 *     { "type": "text",        "text": "hello" }
 *     { "type": "tool_call",   "id": "...", "name": "...", "arguments": { ... } }
 *     { "type": "tool_result", "tool_call_id": "...", "output": "...", "is_error": false }
 */
@Serializable
public sealed interface ChatMessage {
    public companion object
}

/** A plain text message. */
@Serializable
@SerialName("text")
public data class TextMessage(
    @SerialName("text")
    val text: String,
) : ChatMessage

/** A request from the assistant to invoke a tool. */
@Serializable
@SerialName("tool_call")
public data class ToolCallMessage(
    @SerialName("id")
    val id: String,
    @SerialName("name")
    val name: String,
    // Tool arguments are free-form JSON decided by each tool's schema, so we keep
    // them as a JsonObject rather than over-modeling them here. Default makes the
    // field optional on the wire — older payloads without "arguments" still decode.
    @SerialName("arguments")
    val arguments: JsonObject = JsonObject(emptyMap()),
) : ChatMessage

/** The result of a tool invocation, correlated back by [toolCallId]. */
@Serializable
@SerialName("tool_result")
public data class ToolResultMessage(
    @SerialName("tool_call_id")
    val toolCallId: String,
    @SerialName("output")
    val output: String,
    // New field added by the server team in a later version. Because it has a
    // default, old payloads (which never sent it) still decode cleanly, and new
    // clients reading old data fall back to `false`.
    @SerialName("is_error")
    val isError: Boolean = false,
) : ChatMessage

/**
 * Fallback bucket for any message `type` this client build does not recognize.
 *
 * The server team ships new message types over time; an old client must keep
 * working instead of throwing. The polymorphic default deserializer in
 * [ChatJson] routes every unknown discriminator here, preserving the raw JSON
 * in [raw] so the message can be logged, re-displayed generically, or even
 * round-tripped forward by a relaying client.
 *
 * Note: this type is deserialize-only by design — we never *produce* an
 * UnknownMessage locally, we only receive ones the server invented.
 */
@Serializable
@SerialName("__unknown__")
public data class UnknownMessage(
    @SerialName("type")
    val type: String = "",
    @SerialName("raw")
    val raw: JsonElement? = null,
) : ChatMessage
