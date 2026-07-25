@file:OptIn(ExperimentalSerializationApi::class)

package com.example.chat.wire

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic

/**
 * The single, shared [Json] instance for the chat wire protocol.
 *
 * This is the only object that should be used to encode/decode [ChatMessage]s,
 * across both the Android app and the KMP module. Keep it as one shared
 * instance — Json is thread-safe and caches serializers, so reusing it is both
 * correct and faster than constructing one per call.
 *
 * Configuration rationale:
 *
 *  - `ignoreUnknownKeys = true`
 *      Old clients tolerate new *fields*. When the server adds a key we don't
 *      model, we drop it instead of throwing. This is the single most important
 *      forward-compat switch.
 *
 *  - `classDiscriminator = "type"`
 *      Pins the polymorphic tag key to the wire contract ("type") rather than
 *      kotlinx's default ("type" happens to be the default, but we state it
 *      explicitly so a future kotlinx default change can't silently break us).
 *
 *  - `encodeDefaults = false`
 *      Fields equal to their default (e.g. `isError = false`, empty arguments)
 *      are omitted from the output. Smaller payloads, and — combined with the
 *      defaults on the model — fully symmetric forward/backward compat.
 *
 *  - polymorphic default deserializer
 *      Unknown *types* decode to [UnknownMessage] instead of throwing. This is
 *      the type-level analogue of `ignoreUnknownKeys`.
 *
 *  - `isLenient = false`, `explicitNulls = false`
 *      Strict parsing of values (catch genuinely malformed payloads early) while
 *      not emitting `"field": null` for absent optionals.
 */
public val ChatJson: Json = Json {
    ignoreUnknownKeys = true
    classDiscriminator = "type"
    encodeDefaults = false
    explicitNulls = false
    isLenient = false

    serializersModule = SerializersModule {
        polymorphic(ChatMessage::class) {
            // Unknown discriminator -> capture instead of crash.
            defaultDeserializer { discriminator ->
                UnknownDelegateSerializer(discriminator ?: "")
            }
        }
    }
}

/**
 * Bridges an unknown polymorphic payload into an [UnknownMessage].
 *
 * kotlinx hands us only the discriminator string; we re-read the full object as
 * a [JsonElement] so the raw body is preserved. We delegate to [JsonObject]'s
 * serializer for the structural read and then wrap the result.
 */
private class UnknownDelegateSerializer(
    private val discriminator: String,
) : kotlinx.serialization.DeserializationStrategy<ChatMessage> {

    private val delegate = JsonObject.serializer()

    override val descriptor get() = delegate.descriptor

    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ChatMessage {
        val obj: JsonObject = delegate.deserialize(decoder)
        val type = (obj["type"] as? JsonPrimitive)?.contentOrNull
            ?: discriminator
        return UnknownMessage(type = type, raw = obj)
    }
}

// --- Convenience helpers ----------------------------------------------------

/** Encode a single message to its JSON string. */
public fun ChatMessage.encodeToWire(): String =
    ChatJson.encodeToString(ChatMessage.serializer(), this)

/** Decode a single message from a JSON string (never throws on unknown types). */
public fun decodeChatMessage(json: String): ChatMessage =
    ChatJson.decodeFromString(ChatMessage.serializer(), json)

/** Encode a list of messages (e.g. a whole conversation) to JSON. */
public fun encodeConversation(messages: List<ChatMessage>): String =
    ChatJson.encodeToString(
        kotlinx.serialization.builtins.ListSerializer(ChatMessage.serializer()),
        messages,
    )

/** Decode a list of messages from JSON. */
public fun decodeConversation(json: String): List<ChatMessage> =
    ChatJson.decodeFromString(
        kotlinx.serialization.builtins.ListSerializer(ChatMessage.serializer()),
        json,
    )
