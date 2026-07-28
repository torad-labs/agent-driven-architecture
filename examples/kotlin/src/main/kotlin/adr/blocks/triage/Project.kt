// ── blocks/triage/project — TWO pure projections of the SAME slice ─────────
// slice → view      what a human reads    (6.9, the Presenter)
// slice → lines     what the reasoner reads (G15, the third projection)
//
// They live on one CONSTRUCTED type because they are the same kind of thing: total,
// pure functions of committed state, with no clock, no I/O and no accumulator. The
// context lines are BOUNDED by a declared constant, so the reasoner's input does not
// grow with session length.
//
// `MAX_CONTEXT_LINES_PER_BLOCK` stays a spine constant and is deliberately NOT a
// constructor parameter. The lesson this file teaches is "the projection is bounded by
// a DECLARED constant"; injecting the bound would make it a per-app knob and delete the
// lesson. Instantiation is what the law asks for — bindability is a different, stronger
// property, and it is not wanted here.

package adr.blocks.triage

import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK

data class TicketRow(
    val ticket: String,
    val body: String,
    /** Pre-computed here, not in the view. */
    val badge: String,
)

data class TriageView(val rows: List<TicketRow>)

class TriageProjection {

    fun view(slice: TriageSlice): TriageView = TriageView(
        rows = slice.tickets.values.map { ticket ->
            TicketRow(
                ticket = ticket.id.value,
                body = ticket.body,
                badge = (slice.priority[ticket.id] ?: Priority.Normal).name.uppercase(),
            )
        },
    )

    fun contextLines(slice: TriageSlice): List<String> =
        slice.tickets.values
            .take(MAX_CONTEXT_LINES_PER_BLOCK)
            .map { "ticket ${it.id.value} [${(slice.priority[it.id] ?: Priority.Normal).name}] ${it.body}" }
}
