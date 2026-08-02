// ── blocks/triage/project — TWO pure projections of the SAME slice ─────────
// slice → view      what a human reads    (6.9, the Presenter)
// slice → lines     what the reasoner reads (G15, the third projection)
//
// They live on one CONSTRUCTED type because they are the same kind of thing: total,
// pure functions of committed state, with no clock, no I/O and no accumulator. The
// context lines are BOUNDED by declaration, so the reasoner's input does not
// grow with session length.
//
// THE BOUND IS DECLARED IN THE SPINE AND PASSED IN (docs/DECISIONS.md:174). This file
// used to argue the opposite — that injecting it would make it "a per-app knob and
// delete the lesson" — and the argument was wrong on its own terms: the lesson is that
// the projection is bounded BY DECLARATION rather than by discipline, and a defaulted
// parameter naming `MAX_CONTEXT_LINES_PER_BLOCK` declares it exactly as loudly. What
// the constant additionally did was make the bound UNCHECKABLE: it stamped the
// committed digest and re-derived it, so moving it left both gates green. The default
// is now pinned to its literal by a test, and a timeline re-derived under a different
// window diverges — neither of which the welded constant could express.

package adr.blocks.triage

import adr.contract.TriageResult.Priority
import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK

data class TicketRow(
    val ticket: String,
    val body: String,
    /** Pre-computed here, not in the view. */
    val badge: String,
)

data class TriageView(val rows: List<TicketRow>)

internal class TriageProjection {

    fun view(slice: TriageSlice): TriageView = TriageView(
        rows = slice.tickets.values.map { ticket ->
            TicketRow(
                ticket = ticket.id.value,
                body = ticket.body,
                badge = (slice.priority[ticket.id] ?: Priority.Normal).name.uppercase(),
            )
        },
    )

    fun contextLines(slice: TriageSlice, maxLines: Int = MAX_CONTEXT_LINES_PER_BLOCK): List<String> =
        slice.tickets.values
            .take(maxLines)
            .map { "ticket ${it.id.value} [${(slice.priority[it.id] ?: Priority.Normal).name}] ${it.body}" }
}
