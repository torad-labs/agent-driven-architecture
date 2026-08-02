// ALLOW-TEST C4 — the same verb, carrying its own domain payload and nothing else.
// The variants declare `sig`-free payloads; authorship and permission ride the
// Command the boundary signs afterwards. Note this is not an impoverished shape:
// it is the shipped one, and the block loses nothing by it, because `requestedBy`
// is read out of committed State by the gate.
package adr.contract

import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

sealed interface EscalationResult : ToolResult {
    val ticket: TicketId

    data class RequestEscalation(
        override val tool: ToolName,
        override val ticket: TicketId,
    ) : EscalationResult

    data class ConfirmEscalation(
        override val tool: ToolName,
        override val ticket: TicketId,
    ) : EscalationResult
}
