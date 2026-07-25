// ── blocks/triage/slice — the block's own state, and its pure transitions ──
// Copy-on-write; never mutate the input. Structural equality is what makes the
// replay comparison and the golden-effect diff meaningful (14.1).

package adr.blocks.triage

import adr.spine.pure.TicketId

enum class Priority { Low, Normal, High, Urgent }

data class Ticket(val id: TicketId, val body: String)

data class TriageSlice(
    val tickets: Map<TicketId, Ticket> = emptyMap(),
    val priority: Map<TicketId, Priority> = emptyMap(),
) {
    // No companion: a companion member has no instance, which is the same defect as a
    // top-level function. The EMPTY slice is now what the primary constructor builds
    // when told nothing — `TriageSlice()` — so the shape carries its own starting value and
    // nothing extra has to exist to hand it over.
    fun withPriority(ticket: TicketId, level: Priority): TriageSlice =
        copy(priority = priority + (ticket to level))
}
