// ── blocks/escalation/fold — the block's ARM ───────────────────────────────
// Exactly two closed matches, and each buys a different guarantee:
//
//   `when (result)` over the block's sealed sub-union — SITE 4 of the four a NEW VERB
//       touches (§11.1). Adding a verb fails to compile until it lands here.
//   `when (status)` over TicketStatus — SITE 1 OF 3 a new STATE VARIANT touches
//       (§11.2). Adding `Archived` fails to compile until it lands here, and in the two
//       matches in Project.kt. Nowhere else in the system names TicketStatus at all.
//
// F9's measured bugs lived in this arm's ancestor:
//   confirm with NO prior Request (ticket Open) → PageOncall fired, status Escalated
//   confirm on a ticket absent from State       → PageOncall("nope") fired AND run → Degraded
// Both are structurally impossible now: the gate refuses the first before the fold ever
// sees it, and the arm reads state before it decides for the second.

package adr.blocks.escalation

import adr.contract.EscalationEffect
import adr.contract.EscalationResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

fun escalationArm(
    slice: EscalationSlice,
    result: EscalationResult,
    now: Timestamp,
    sig: Signature,
): ArmOut<EscalationSlice> {
    // RULE 1: read current state before deciding.
    val status = slice.statusOf(result.ticket)
        ?: return reject(slice, now, result, "unknown ticket ${result.ticket.value}")

    // What this verb wants the ticket to become. Exhaustive over the block's sub-union.
    val intent = when (result) {
        is EscalationResult.RequestEscalation ->
            TicketStatus.Escalating(result.ticket, sig.authority)

        is EscalationResult.ConfirmEscalation ->
            TicketStatus.Escalated(result.ticket, sig.authority)
    }

    // Whether the ticket may move there FROM WHERE IT ACTUALLY IS. Exhaustive over TicketStatus.
    val permitted = when (status) {
        is TicketStatus.Open -> intent is TicketStatus.Escalating
        is TicketStatus.Escalating -> intent is TicketStatus.Escalated
        is TicketStatus.Escalated -> false
        is TicketStatus.Resolved -> false
    }

    if (!permitted) {
        return reject(
            slice,
            now,
            result,
            "ticket ${result.ticket.value} is not in a state that allows ${result.tool.value}",
        )
    }

    // RULE 2: the irreversible effect lives INSIDE the success branch, and only for the
    // transition that actually reaches Escalated.
    val effects = if (intent is TicketStatus.Escalated) {
        listOf(EscalationEffect.PageOncall(now, result.ticket))
    } else {
        emptyList()
    }

    return ArmOut(slice = slice.with(intent), effects = effects)
}

// RULE 3: a rejection folds a per-item Notice — never RunStatus, never a mutation.
private fun reject(
    slice: EscalationSlice,
    now: Timestamp,
    result: EscalationResult,
    reason: String,
): ArmOut<EscalationSlice> =
    ArmOut(slice = slice, notices = listOf(Notice.Rejected(now, result.tool, reason)))
