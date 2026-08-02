// BLOCK-TEST C4 (G1) — a ToolResult variant carries an Actor.
// This is the review's measured (G1) bug, exactly: the shipped port let a TOOL copy an Actor
// into its own payload, the gate branched on THAT, and the log recorded a
// different Actor the boundary stamped after the fold had already run. Two
// unreconciled values, and the stamp was causally incapable of gating.
//
// The field is checked by its TYPE, off the parse tree — a parameter called
// `actor: String` is a different (and legal) thing.
package adr.contract

import adr.spine.pure.Actor
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

sealed interface EscalationResult : ToolResult {
    val ticket: TicketId

    data class ConfirmEscalation(
        override val tool: ToolName,
        override val ticket: TicketId,
        val by: Actor,
    ) : EscalationResult
}
