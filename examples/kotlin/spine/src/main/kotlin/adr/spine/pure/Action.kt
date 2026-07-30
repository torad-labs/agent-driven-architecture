// ── spine/pure/action — the OPEN boundary input (G1) ───────────────────────
// An Action is the one thing that crosses INTO the system: a (tool name, raw
// input) pair. A person tapping a control and a model calling a tool produce the
// SAME Action; the boundary's closed name→ToolResult map (spine/boundary/action)
// turns it into a sealed value before anything folds.
//
// The TYPE lives here, in the pure ring, because StepRecord — which is pure and
// is what the append-only bus stores — has to carry the actions that were asked
// for. The MAP that resolves an Action lives at the boundary, where the open
// name actually arrives.

package adr.spine.pure

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** What was ASKED. Half of the audit pair; ToolResult is the other half. */
data class Action(val tool: ToolName, val input: RawInput)

/**
 * The untrusted payload a tool call carries, and the ONLY thing that reads it.
 *
 * This was a `typealias RawInput = JsonElement` with two extension functions and a
 * `rawOf` builder beside it — three top-level functions, none of them attached to
 * anything. An extension function is not a member: it dispatches statically, it cannot
 * be overridden, and there is no instance to substitute. Making the payload a real type
 * turns its two accessors into ordinary members, so `input.text("ticket")` reads exactly
 * as it did while now belonging to something, and the builder becomes a constructor.
 *
 * Reading stays TOTAL and null-returning: a missing field, a wrong shape and a
 * non-scalar are all `null`, never a throw, because the payload is untrusted and a
 * decode failure must fold as ToolResult.Unhandled rather than crash the boundary.
 */
class RawInput(private val json: JsonElement) {

    /** Build from flat string fields — what a form, a demo or a test hands the surface. */
    constructor(vararg fields: Pair<String, String>) :
        this(JsonObject(fields.associate { (k, v) -> k to JsonPrimitive(v) }))

    /** A string field, or null if it is missing or not a scalar. */
    fun text(field: String): String? =
        ((json as? JsonObject)?.get(field) as? JsonPrimitive)?.contentOrNull

    /** A boolean field, tolerating `true` and `"true"`. */
    fun flag(field: String): Boolean? =
        ((json as? JsonObject)?.get(field) as? JsonPrimitive)
            ?.let { it.booleanOrNull ?: it.contentOrNull?.toBooleanStrictOrNull() }

    override fun equals(other: Any?): Boolean = other is RawInput && other.json == json

    override fun hashCode(): Int = json.hashCode()

    override fun toString(): String = json.toString()
}
