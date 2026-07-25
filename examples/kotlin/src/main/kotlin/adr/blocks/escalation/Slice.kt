// ── blocks/escalation/slice — a sealed status with a parent-declared field ──
// TicketStatus is the L3 showcase inside a block: the parent declares `ticket`, so
// every state a ticket can be in carries its own identity by construction, and the
// two states that record a principal record WHICH principal — which is what the
// boundary gate compares against (14.3: "a different actor than the one that issued
// the Request", implemented as a different PRINCIPAL, not as "a human").

package adr.blocks.escalation

import adr.spine.pure.Authority
import adr.spine.pure.TicketId

sealed interface TicketStatus {
    val ticket: TicketId

    data class Open(override val ticket: TicketId) : TicketStatus

    /** Reversible. Records WHO ASKED, so the confirm can be required to differ. */
    data class Escalating(
        override val ticket: TicketId,
        val requestedBy: Authority,
    ) : TicketStatus

    /** Irreversible, already done. Records WHO CONFIRMED. */
    data class Escalated(
        override val ticket: TicketId,
        val confirmedBy: Authority,
    ) : TicketStatus

    data class Resolved(override val ticket: TicketId) : TicketStatus
}

data class EscalationSlice(val status: Map<TicketId, TicketStatus>) {
    fun statusOf(ticket: TicketId): TicketStatus? = status[ticket]

    fun with(next: TicketStatus): EscalationSlice = copy(status = status + (next.ticket to next))

    companion object {
        /** The starting slice, on the SHAPE — `State`'s field default needs it before any block exists. */
        val empty = EscalationSlice(status = emptyMap())

        fun of(tickets: List<TicketId>): EscalationSlice =
            EscalationSlice(tickets.associateWith { TicketStatus.Open(it) })
    }
}
