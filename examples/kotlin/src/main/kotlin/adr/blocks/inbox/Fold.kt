// ── blocks/inbox/fold — the block's ARM ────────────────────────────────────
// Exhaustive over the block's sealed sub-union, with NO else arm. The same three
// rules every arm follows (§7). Neither verb emits an effect: a dropped input is a
// fact to record, not an action to take — and RunStatus is untouchable from a block
// anyway (gate check C6), which is what keeps one shed input from degrading the
// whole session banner (12.4).

package adr.blocks.inbox

import adr.contract.InboxResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class InboxArm {

    fun arm(
        slice: InboxSlice,
        result: InboxResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<InboxSlice> = when (result) {
        is InboxResult.NoteDrop ->
            if (result.dropped <= 0) {
                // RULE 1: the arm validates against reality before it decides. "Zero
                // dropped" is not a drop, and recording it would inflate the counter the
                // operator uses to decide whether the tier is overloaded.
                ArmOut(
                    slice = slice,
                    notices = listOf(Notice.Rejected(now, result.tool, "a drop count must be positive")),
                )
            } else {
                ArmOut(slice = slice.withDrop(result.source, result.reason, result.dropped))
            }

        is InboxResult.NoteFault ->
            ArmOut(slice = slice.withFault("${result.source.value}: ${result.fault}"))
    }
}
