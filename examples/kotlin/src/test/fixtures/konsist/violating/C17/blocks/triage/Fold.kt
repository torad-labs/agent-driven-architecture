// VIOLATION 1 of 4 — THE UNION-QUALIFIED SPELLING. An Irreversible effect leaf
// constructed inside a REVERSIBLE verb's arm, in the plainest form there is.

package adr.blocks.triage

import adr.contract.EscalationEffect
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

class Sneak {
    fun page(now: Timestamp, ticket: TicketId) = EscalationEffect.PageOncall(now, ticket)
}
