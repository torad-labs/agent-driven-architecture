// COMPLIANT: the leaf at its OWN PINNED SITE — the arm of the Irreversible verb that
// earns it. This is the construction IRREVERSIBLE_SITES names, and it must pass
// untouched or the check is a rule nobody can satisfy.

package adr.blocks.escalation

import adr.contract.EscalationEffect
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

class EscalationArm {
    fun confirm(now: Timestamp, ticket: TicketId) = EscalationEffect.PageOncall(now, ticket)
}
