// ── blocks/escalation/contract — the block's transport ─────────────────────
// The gated slice: a REQUEST is reversible, a CONFIRM is not. Both are ordinary
// verbs with ordinary Command cases; the difference lives in the Verb table's
// reversibility classification and in the boundary gate, not in a second mechanic.

package adr.contract

import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName

sealed interface EscalationResult : ToolResult {
    /**
     * L3 one level down: a BLOCK's sub-union declares its own shared property on its own
     * parent. Every escalation verb is about a ticket, so every variant carries one by
     * construction — and the block's fold arm never has to ask which case it has just to
     * find out which ticket it is talking about.
     */
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

sealed interface EscalationCommand : Command {
    data class RequestEscalation(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val ticket: TicketId,
    ) : EscalationCommand

    data class ConfirmEscalation(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val ticket: TicketId,
    ) : EscalationCommand
}

sealed interface EscalationEffect : Effect {
    /** IRREVERSIBLE. Fires only inside the confirm arm's success branch. */
    data class PageOncall(
        override val at: Timestamp,
        val ticket: TicketId,
    ) : EscalationEffect
}
