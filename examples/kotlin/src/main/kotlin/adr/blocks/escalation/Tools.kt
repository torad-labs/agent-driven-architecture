// ── blocks/escalation/tools — the Verb table, including the gated verb ─────
// `confirmEscalation` is Verb.Irreversible, and Irreversible CANNOT BE CONSTRUCTED
// without `requestedBy`: the lens that reads, out of committed State, WHICH
// AUTHORITY asked for this. That lens is the whole of 14.3's "a different actor
// than the one that issued the Request", and the gate — not this file — enforces it.
//
// Note what this file cannot say: it never names Actor, Authority or Signature
// (gate check C4). A tool cannot ask who is asking, because the answer is stamped
// after it returns.
//
// THIS is the block where the split rule earns its keep. `lens` is read by the
// `requestedBy` row below and is fixed for the whole registration, so it becomes
// constructor state and drops out of the table — the same move the boundary makes with
// its registry in spine/boundary/action. The other five blocks take the same parameter
// for a uniform root, but this one is the reason the parameter exists.

package adr.blocks.escalation

import adr.contract.EscalationCommand
import adr.contract.EscalationResult
import adr.spine.pure.RawInput
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName
import adr.spine.pure.Verb
import adr.spine.pure.text

val REQUEST_ESCALATION = ToolName("requestEscalation")
val CONFIRM_ESCALATION = ToolName("confirmEscalation")

data class TicketInput(val ticket: TicketId)

class EscalationTools<S>(private val lens: (S) -> EscalationSlice) {

    fun verbs(): List<Verb<S, *, *>> = listOf(
        Verb.Reversible(
            name = REQUEST_ESCALATION,
            describe = "Request escalation of a ticket. Reversible; does NOT page on-call.",
            decode = ::decodeTicket,
            run = { input, _ -> EscalationResult.RequestEscalation(REQUEST_ESCALATION, input.ticket) },
            sign = { r, sig, id -> EscalationCommand.RequestEscalation(r.tool, sig, id, r.ticket) },
        ),
        Verb.Irreversible(
            name = CONFIRM_ESCALATION,
            describe = "Confirm a pending escalation. IRREVERSIBLE: it pages the on-call engineer.",
            decode = ::decodeTicket,
            run = { input, _ -> EscalationResult.ConfirmEscalation(CONFIRM_ESCALATION, input.ticket) },
            sign = { r, sig, id -> EscalationCommand.ConfirmEscalation(r.tool, sig, id, r.ticket) },
            requestedBy = { state, result ->
                (result as? EscalationResult.ConfirmEscalation)
                    ?.let { lens(state).statusOf(it.ticket) }
                    ?.let { it as? TicketStatus.Escalating }
                    ?.requestedBy
            },
        ),
    )

    private fun decodeTicket(raw: RawInput): TicketInput? =
        raw.text("ticket")?.let { TicketInput(TicketId(it)) }
}
