// ── blocks/triage/slice — the block's own state, and its pure transitions ──
// Copy-on-write; never mutate the input. Structural equality is what makes the
// replay comparison and the golden-effect diff meaningful (14.1).

package adr.blocks.triage

import adr.contract.TriageResult.Priority
import adr.spine.pure.TicketId

// `Priority` is declared on this block's own sealed transport root, in
// blocks/triage/Contract.kt, because Kotlin's sealed rule authors that file inside
// `:spine` and the transport NAMES this type (ADR-001 §3). The import is what C2's
// name-prefix rule admits: `TriageResult.Priority` starts with `Triage`.

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
