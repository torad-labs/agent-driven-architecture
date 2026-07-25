@file:OptIn(ExperimentalSerializationApi::class)

package com.example.chat.wire

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic

/**
 * The single, shared [Json] codec for the chat wire format.
 *
 * Built **once** into a top-level `val` and reused for every encode/decode call.
 * `Json` caches per-class descriptor analysis; constructing `Json { }` inside a
 * response handler throws that cache away on every message and re-runs it. Inject
 * or reference this instance instead of building inline. [core-kotlin
 * Serialization §1]
 */
public val WireJson: Json = Json {
    // explicitNulls stays at its default `true`. With it off, a nullable field
    // that has a non-null default would decode a JSON `null` back to the
    // default — making encode-then-decode non-idempotent and silently lossy.
    // We keep it true so round-tripping is exact; our `output: String? = null`
    // field stays null when the server sends null. [core-kotlin Serialization §7]
    explicitNulls = true

    // Forward-compat for *unknown fields* is handled per-class with
    // @JsonIgnoreUnknownKeys on each inbound model, NOT with the global
    // `ignoreUnknownKeys = true` flag. The global flag would also make our
    // request/strict models swallow typos; the per-class annotation keeps
    // leniency scoped to the inbound types that actually need it. [core-kotlin
    // Serialization §5]  (Deliberately NOT set: ignoreUnknownKeys = true)

    // Forward-compat for *unknown enum values*: a server-introduced role/status
    // we don't have a constant for decodes to its enum default (…UNKNOWN)
    // instead of throwing. This is the enum analogue of the unknown-subtype
    // fallback below. [core-kotlin Serialization, Ergonomics]
    //
    // GOTCHA (verified by running, not just compiling): coerceInputValues only
    // coerces an out-of-range value to the property's DEFAULT. An enum-typed
    // field with no default still throws on an unknown value. Hence every enum
    // wire field is declared with a `= …UNKNOWN` default in ChatWireModels.kt.
    coerceInputValues = true

    // Smaller payloads + omit fields equal to their default (e.g. an empty
    // arguments map, status == UNKNOWN). Defaults are reconstructed on decode.
    encodeDefaults = false

    // Forward-compat for *unknown message types*. An evolving polymorphic
    // hierarchy WILL receive subtypes this build predates; without a default the
    // decoder throws `Serializer for subclass 'X' is not found`. Registering
    // UnknownMessage as the polymorphic defaultDeserializer degrades that to a
    // typed, inspectable value that preserves the raw discriminator. The
    // discriminator key itself ("type") is fixed on the base via
    // @JsonClassDiscriminator, so it does not need repeating here. [core-kotlin
    // Serialization §6, §3]
    serializersModule = SerializersModule {
        polymorphic(Message::class) {
            defaultDeserializer { UnknownMessage.serializer() }
        }
    }
}
