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
        /**
         * The block's starting slice, and its seeded one. They live on the SLICE — the
         * shape they produce — rather than on the block, because `State`'s field default
         * needs a value before any block exists. This is already the idiom in
         * blocks/inbox, blocks/artifact and blocks/analysis; triage now matches it.
         */
        val empty = TriageSlice(tickets = emptyMap(), priority = emptyMap())

        fun of(tickets: List<Ticket>): TriageSlice =
            TriageSlice(tickets = tickets.associateBy { it.id }, priority = emptyMap())
    }
}
