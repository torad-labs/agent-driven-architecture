// ── blocks/triage/fold — the block's ARM ───────────────────────────────────
// Exhaustive over the block's sealed sub-union, with NO else arm. Three rules (§7),
// mechanical, no exceptions:
//
//   1. the arm READS CURRENT STATE before it decides;
//   2. every effect push lives INSIDE THE SUCCESS BRANCH;
//   3. a rejection folds a per-item Notice.Rejected — never RunStatus, never a
//      mutation.
//
// F9's measured bug lived exactly here: setPriority on unknown ticket 9999 performed
// an Effect.Log, committed a SetPriority command and left the folded state
// UNCHANGED — a clean-looking audit record for a mutation that never happened.

package adr.blocks.triage

import adr.contract.TriageEffect
import adr.contract.TriageResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

fun triageArm(
    slice: TriageSlice,
    result: TriageResult,
    now: Timestamp,
    sig: Signature,
): ArmOut<TriageSlice> = when (result) {
    is TriageResult.SetPriority -> {
        if (slice.tickets[result.ticket] == null) {
            ArmOut(
                slice = slice,
                notices = listOf(
                    Notice.Rejected(now, result.tool, "unknown ticket ${result.ticket.value}"),
                ),
            )
        } else {
            ArmOut(
                slice = slice.withPriority(result.ticket, result.level),
                // `supersedes` is the fold reading ITS OWN current state (4.3): the tool
                // returned raw inputs only, and could not have known the previous level.
                effects = listOf(
                    TriageEffect.LogDecision(
                        at = now,
                        ticket = result.ticket,
                        level = result.level,
                        supersedes = slice.priority[result.ticket],
                    ),
                ),
            )
        }
    }
}
