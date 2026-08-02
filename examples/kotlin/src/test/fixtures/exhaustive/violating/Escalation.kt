// ── G12 fixture (BLOCK-TEST: five variants, three consumers left alone) ──────────────────────────────────────────
// A faithful copy of blocks/escalation's THREE consumers of TicketStatus,
// against the REAL spine vocabulary, so what this proves is what the live tree
// does — not a toy that resembles it.
//
// §11.2 promises: adding a state variant costs 1 append + 3 compiler-named arms,
// ALL INSIDE ONE BLOCK FOLDER. The review measured (G12) that promise failing — 15.4's G12
// self-check ("introduce a variant; the build must break") had never been run, and
// projection.ts computed `canEscalate` with `t.status.kind === "Open"`, which is
// not a closed match at all: it compiles happily after a variant is added and
// silently answers the wrong thing.
//
// The three sites below are written the way the live ones are: `when` AS AN
// EXPRESSION, every variant named, NO else arm. That is what makes the compiler,
// not a reviewer, produce the edit list.

package adr.fixture.escalation

import adr.contract.EscalationResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Authority
import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

sealed interface TicketStatus {
    val ticket: TicketId

    data class Open(override val ticket: TicketId) : TicketStatus

    data class Escalating(override val ticket: TicketId, val requestedBy: Authority) : TicketStatus

    data class Escalated(override val ticket: TicketId, val confirmedBy: Authority) : TicketStatus

    data class Resolved(override val ticket: TicketId) : TicketStatus

    /** THE FIFTH VARIANT. Nothing below it was touched — that is the point. */
    data class Archived(override val ticket: TicketId, val at: Timestamp) : TicketStatus
}

data class EscalationSlice(val status: Map<TicketId, TicketStatus>) {
    fun statusOf(ticket: TicketId): TicketStatus? = status[ticket]

    fun with(next: TicketStatus): EscalationSlice = copy(status = status + (next.ticket to next))
}

data class EscalationRow(
    val ticket: String,
    val state: String,
    val canEscalate: Boolean,
    val escalating: Boolean,
    val escalated: Boolean,
)

data class EscalationView(val rows: List<EscalationRow>)

// ── SITE 1 of 3 — the fold arm's transition match ─────────────────────────
fun escalationArm(
    slice: EscalationSlice,
    result: EscalationResult,
    now: Timestamp,
    sig: Signature,
): ArmOut<EscalationSlice> {
    val status = slice.statusOf(result.ticket)
        ?: return ArmOut(slice, notices = listOf(Notice.Rejected(now, result.tool, "unknown ticket")))

    val intent = when (result) {
        is EscalationResult.RequestEscalation -> TicketStatus.Escalating(result.ticket, sig.authority)
        is EscalationResult.ConfirmEscalation -> TicketStatus.Escalated(result.ticket, sig.authority)
    }

    val permitted = when (status) {
        is TicketStatus.Open -> intent is TicketStatus.Escalating
        is TicketStatus.Escalating -> intent is TicketStatus.Escalated
        is TicketStatus.Escalated -> false
        is TicketStatus.Resolved -> false
    }

    return if (permitted) {
        ArmOut(slice.with(intent))
    } else {
        ArmOut(slice, notices = listOf(Notice.Rejected(now, result.tool, "not in a state that allows this")))
    }
}

// ── SITE 2 of 3 — the view's row match ────────────────────────────────────
fun escalationView(slice: EscalationSlice): EscalationView = EscalationView(
    rows = slice.status.values.map { status ->
        when (status) {
            is TicketStatus.Open -> EscalationRow(status.ticket.value, "open", true, false, false)
            is TicketStatus.Escalating ->
                EscalationRow(status.ticket.value, "escalating (asked by ${status.requestedBy.id})", false, true, false)

            is TicketStatus.Escalated ->
                EscalationRow(status.ticket.value, "escalated (confirmed by ${status.confirmedBy.id})", false, false, true)

            is TicketStatus.Resolved -> EscalationRow(status.ticket.value, "resolved", false, false, false)
        }
    },
)

// ── SITE 3 of 3 — the context projection's status match ───────────────────
fun escalationContextLines(slice: EscalationSlice): List<String> =
    slice.status.values.take(MAX_CONTEXT_LINES_PER_BLOCK).map { status ->
        when (status) {
            is TicketStatus.Open -> "ticket ${status.ticket.value} is open"
            is TicketStatus.Escalating -> "ticket ${status.ticket.value} has a PENDING escalation request"
            is TicketStatus.Escalated -> "ticket ${status.ticket.value} is escalated; on-call paged"
            is TicketStatus.Resolved -> "ticket ${status.ticket.value} is resolved"
        }
    }
