// ── spine/pure/action — the OPEN boundary input (F1) ───────────────────────
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

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/** What was ASKED. Half of the audit pair; ToolResult is the other half. */
data class Action(val tool: ToolName, val input: RawInput)

/** Read a string field out of a raw input, or null if it is missing or not a scalar. */
fun RawInput.text(field: String): String? =
    ((this as? JsonObject)?.get(field) as? JsonPrimitive)?.contentOrNull

/** Read a boolean field out of a raw input, tolerating `true` and `"true"`. */
fun RawInput.flag(field: String): Boolean? =
    ((this as? JsonObject)?.get(field) as? JsonPrimitive)
        ?.let { it.booleanOrNull ?: it.contentOrNull?.toBooleanStrictOrNull() }

/** Build a raw input from flat string fields — what a form or a test hands the surface. */
fun rawOf(vararg fields: Pair<String, String>): RawInput =
    JsonObject(fields.associate { (k, v) -> k to JsonPrimitive(v) })
