// ── blocks/escalation/project — TWO pure projections of the SAME slice ─────
// SITE 2 OF 3 (the view row match) and SITE 3 OF 3 (the context line match) for a
// new TicketStatus variant (§11.2). Both are closed matches with NO else arm, so
// the compiler's edit list for `Archived(ticket, at)` is exactly these three sites,
// all inside blocks/escalation/. Zero sites outside the block.
//
// This is also F10's fix in place: `t.status is Open` as a way to compute
// `canEscalate` is NOT a closed match — it compiles happily after a variant is
// added and silently answers the wrong thing.

package adr.blocks.escalation

import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK

data class EscalationRow(
    val ticket: String,
    val state: String,
    /** Pre-decided here, not in the view. */
    val canEscalate: Boolean,
    val escalating: Boolean,
    val escalated: Boolean,
)

data class EscalationView(val rows: List<EscalationRow>)

fun escalationView(slice: EscalationSlice): EscalationView = EscalationView(
    rows = slice.status.values.map { status ->
        when (status) {
            is TicketStatus.Open -> EscalationRow(
                ticket = status.ticket.value,
                state = "open",
                canEscalate = true,
                escalating = false,
                escalated = false,
            )

            is TicketStatus.Escalating -> EscalationRow(
                ticket = status.ticket.value,
                state = "escalating (asked by ${status.requestedBy.id})",
                canEscalate = false,
                escalating = true,
                escalated = false,
            )

            is TicketStatus.Escalated -> EscalationRow(
                ticket = status.ticket.value,
                state = "escalated (confirmed by ${status.confirmedBy.id})",
                canEscalate = false,
                escalating = false,
                escalated = true,
            )

            is TicketStatus.Resolved -> EscalationRow(
                ticket = status.ticket.value,
                state = "resolved",
                canEscalate = false,
                escalating = false,
                escalated = false,
            )
        }
    },
)

fun escalationContextLines(slice: EscalationSlice): List<String> =
    slice.status.values.take(MAX_CONTEXT_LINES_PER_BLOCK).map { status ->
        when (status) {
            is TicketStatus.Open -> "ticket ${status.ticket.value} is open"
            is TicketStatus.Escalating ->
                "ticket ${status.ticket.value} has a PENDING escalation request"

            is TicketStatus.Escalated -> "ticket ${status.ticket.value} is escalated; on-call paged"
            is TicketStatus.Resolved -> "ticket ${status.ticket.value} is resolved"
        }
    }
