// ── blocks/triage/slice — the block's own state, and its pure transitions ──
// Copy-on-write; never mutate the input. Structural equality is what makes the
// replay comparison and the golden-effect diff meaningful (14.1).

package adr.blocks.triage

import adr.spine.pure.TicketId

enum class Priority { Low, Normal, High, Urgent }

data class Ticket(val id: TicketId, val body: String)

data class TriageSlice(
    val tickets: Map<TicketId, Ticket>,
    val priority: Map<TicketId, Priority>,
) {
    fun withPriority(ticket: TicketId, level: Priority): TriageSlice =
        copy(priority = priority + (ticket to level))

    companion object {
        fun of(tickets: List<Ticket>): TriageSlice =
            TriageSlice(tickets = tickets.associateBy { it.id }, priority = emptyMap())
    }
}
