// ── Tool results (seam 03) ──────────────────────────────────────────────────
// The payload a tool returns. Plain data — never an entity, a live handle, or
// the clock. This is what crosses back to the boundary and gets folded.
//
// @Serializable because the SDK serializes a tool's output onto the wire
// (ContentPart.ToolResult.output); the boundary decodes it back to fold it.

package adr

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
sealed interface ToolResult {
    @Serializable @SerialName("PrioritySet")
    data class PrioritySet(val ticket: String, val level: Priority) : ToolResult

    @Serializable @SerialName("EscalationRequested")
    data class EscalationRequested(val ticket: String, val by: Actor) : ToolResult

    @Serializable @SerialName("EscalationConfirmed")
    data class EscalationConfirmed(val ticket: String, val by: Actor) : ToolResult

    @Serializable @SerialName("Focused")
    data class Focused(val ticket: String, val known: Boolean) : ToolResult
}
