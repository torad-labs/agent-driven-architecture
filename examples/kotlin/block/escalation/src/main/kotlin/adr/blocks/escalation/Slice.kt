// ── blocks/escalation/slice — a sealed status with a parent-declared field ──
// TicketStatus is the G12 showcase inside a block: the parent declares `ticket`, so
// every state a ticket can be in carries its own identity by construction, and the
// two states that record a principal record WHICH principal — which is what the
// boundary gate compares against (14.3: "a different actor than the one that issued
// the Request", implemented as a different PRINCIPAL, not as "a human").

package adr.blocks.escalation

import adr.spine.pure.Authority
import adr.spine.pure.TicketId

sealed class TicketStatus(open val ticket: TicketId) {

    data class Open(override val ticket: TicketId) : TicketStatus(ticket)

    /** Reversible. Records WHO ASKED, so the confirm can be required to differ. */
    data class Escalating(
        override val ticket: TicketId,
        val requestedBy: Authority,
    ) : TicketStatus(ticket)

    /** Irreversible, already done. Records WHO CONFIRMED. */
    data class Escalated(
        override val ticket: TicketId,
        val confirmedBy: Authority,
    ) : TicketStatus(ticket)

    data class Resolved(override val ticket: TicketId) : TicketStatus(ticket)
}

data class EscalationSlice(val status: Map<TicketId, TicketStatus> = emptyMap()) {
    // No companion: a companion member has no instance, which is the same defect as a
    // top-level function. The EMPTY slice is now what the primary constructor builds
    // when told nothing — `EscalationSlice()` — so the shape carries its own starting value.
    fun statusOf(ticket: TicketId): TicketStatus? = status[ticket]

    fun with(next: TicketStatus): EscalationSlice = copy(status = status + (next.ticket to next))
}
