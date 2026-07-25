@file:OptIn(ExperimentalSerializationApi::class)

package com.example.chat.wire

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonIgnoreUnknownKeys

/**
 * Wire models for the chat API.
 *
 * These types are decoded from / encoded to the server's JSON. They live in
 * `commonMain` and are shared by the Android app and the KMP module, so they
 * carry **no** platform symbols (`java.*`, `android.*`, `platform.Foundation.*`)
 * — only kotlinx-serialization + Kotlin stdlib types, which ship for every
 * target. [multiplatform §2]
 *
 * Three forces drive every decision here:
 *  1. The server **adds new fields** over time → older clients must not crash.
 *  2. The server **adds new message types** over time → an unknown variant must
 *     degrade, not throw.
 *  3. Kotlin classes get **renamed/moved** during refactors → the wire format
 *     must not depend on a class's fully-qualified name.
 *
 * Decode all inbound JSON through [WireJson] (see ChatWireJson.kt), which fixes
 * the discriminator key and the unknown-subtype fallback in one place.
 */

// ---------------------------------------------------------------------------
// Polymorphic message hierarchy
// ---------------------------------------------------------------------------

/**
 * The base of the polymorphic message hierarchy.
 *
 * - `sealed` so *our own* `when` over known variants is exhaustive at compile
 *   time (a new variant we add becomes a compile error everywhere we handle
 *   messages). [core-kotlin Ergonomics §4]
 * - The discriminator field name is pinned **once** on the base with
 *   [JsonClassDiscriminator]; it is `@InheritableSerialInfo`, so it cannot be
 *   varied per branch and must be chosen at the root. We use `"type"` — the
 *   field the server actually sends — instead of the default `"type"`-vs-class
 *   name behaviour. [core-kotlin Serialization §3]
 *
 * Unknown / future server variants do **not** land here as a thrown exception.
 * [WireJson] registers [UnknownMessage] as the polymorphic `defaultDeserializer`
 * so a `tool_result_v2` we've never heard of decodes to a typed
 * "I don't recognise this" value instead of crashing the app. [core-kotlin
 * Serialization §6]
 */
@Serializable
@JsonClassDiscriminator("type")
public sealed interface Message {
    /** Stable id the server assigns to every message. */
    public val id: String
}

/**
 * A plain text message.
 *
 * `@SerialName("text")` pins the on-wire discriminator value to the literal
 * `"text"`, decoupled from the Kotlin class name. Renaming this class to
 * `PlainTextMessage` tomorrow leaves the JSON contract (`"type":"text"`)
 * untouched. The default discriminator is the FQ class name, which a rename
 * would silently break — so every subtype gets an explicit `@SerialName`.
 * [core-kotlin Serialization §2]
 *
 * `@JsonIgnoreUnknownKeys` is applied **per class** (not via the global
 * `ignoreUnknownKeys` builder flag) so that when the server adds, say, a
 * `formatting` field to text messages, this older client drops the unknown key
 * instead of throwing — while *request* models elsewhere can still reject typos
 * strictly. The annotation does **not** propagate into nested classes, so any
 * inbound nested type must repeat it. [core-kotlin Serialization §5]
 *
 * `role` carries a default of [Role.UNKNOWN]. The default is load-bearing for
 * forward-compat: `coerceInputValues` in [WireJson] only coerces an unknown enum
 * value to the property's **default**, so an enum field with no default would
 * throw on a server-introduced role instead of degrading. [core-kotlin
 * Serialization §6]
 */
@Serializable
@SerialName("text")
@JsonIgnoreUnknownKeys
public data class TextMessage(
    override val id: String,
    public val role: Role = Role.UNKNOWN,
    public val content: String,
) : Message

/**
 * A request from the assistant to invoke a tool.
 *
 * `arguments` is a structured, forward-compatible bag rather than a fixed
 * schema, because tool argument shapes are the part of the contract that
 * changes most often. See [ToolCallArguments].
 */
@Serializable
@SerialName("tool_call")
@JsonIgnoreUnknownKeys
public data class ToolCallMessage(
    override val id: String,
    @SerialName("tool_name")
    public val toolName: String,
    @SerialName("call_id")
    public val callId: String,
    public val arguments: ToolCallArguments,
) : Message

/**
 * The result of a tool invocation.
 *
 * `status` is modelled as an enum with an explicit unknown fallback
 * ([ToolStatus.UNKNOWN]) so a new server status (`rate_limited`, …) decodes to a
 * known-unknown rather than throwing. `output` is nullable-with-default — the
 * idiomatic "absent" signal — never a sentinel like `""`. [core-kotlin
 * Ergonomics §2]
 */
@Serializable
@SerialName("tool_result")
@JsonIgnoreUnknownKeys
public data class ToolResultMessage(
    override val id: String,
    @SerialName("call_id")
    public val callId: String,
    public val status: ToolStatus = ToolStatus.UNKNOWN,
    public val output: String? = null,
) : Message

/**
 * Fallback for a polymorphic `type` this client build does not recognise.
 *
 * Registered as the `defaultDeserializer` for [Message] in [WireJson]. It
 * captures the raw discriminator (the unrecognised `type` value) so callers can
 * log/skip/telemetry it, and keeps the [id] so threading still works. This is
 * the difference between "the server shipped `tool_call_v2` and the app crashed"
 * and "the app silently ignored one message it couldn't render." [core-kotlin
 * Serialization §6]
 *
 * Not a wire type the server emits directly — there is no `@SerialName` because
 * it's only ever produced by the fallback path, never matched by discriminator.
 */
@Serializable
@JsonIgnoreUnknownKeys
public data class UnknownMessage(
    override val id: String = "",
    /** The unrecognised value of the `type` discriminator, when available. */
    @SerialName("type")
    public val rawType: String? = null,
) : Message

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * Tool-call arguments.
 *
 * Modelled as a typed wrapper holding a [Map] of [kotlinx.serialization.json.JsonElement]
 * so the argument *set* can grow on the server without a model change here —
 * each tool's parameters are read out by name at the call site. Using a regular
 * (non-`data`) container around a read-only map keeps it forward-compatible:
 * new tools and new parameters need no edit to this file.
 */
@Serializable
@JsonIgnoreUnknownKeys
public data class ToolCallArguments(
    public val raw: Map<String, JsonElement> = emptyMap(),
)

/**
 * Who authored a message.
 *
 * `@SerialName` pins each wire value; [Role.UNKNOWN] is the explicit fallback
 * for a role the server introduces later (e.g. `developer`), decoded via the
 * Json builder's enum-leniency setting rather than throwing. [core-kotlin
 * Serialization, Ergonomics]
 */
@Serializable
public enum class Role {
    @SerialName("user")
    USER,

    @SerialName("assistant")
    ASSISTANT,

    @SerialName("system")
    SYSTEM,

    @SerialName("unknown")
    UNKNOWN,
}

/** Terminal status of a tool invocation, with an explicit unknown fallback. */
@Serializable
public enum class ToolStatus {
    @SerialName("success")
    SUCCESS,

    @SerialName("error")
    ERROR,

    @SerialName("unknown")
    UNKNOWN,
}
