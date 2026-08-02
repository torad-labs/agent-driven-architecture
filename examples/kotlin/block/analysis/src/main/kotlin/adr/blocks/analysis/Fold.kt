// ── blocks/analysis/fold — the block's ARM ─────────────────────────────────
// Exhaustive over the block's sealed sub-union, with NO else arm. The same three
// rules every arm follows (§7): read current state before deciding, push effects
// only inside the success branch, and fold a per-item Notice on rejection.
//
// The asymmetry between the two arms IS the tiering rule, in code:
// recall APPENDS A NOTE AND EMITS NOTHING; publish is the only path to an effect.
// A conclusion the fast tier recalled therefore cannot be re-published, cannot page
// anyone, and cannot reach any irreversible act on its own (11.3).

package adr.blocks.analysis

import adr.contract.AnalysisEffect
import adr.contract.AnalysisResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

internal class AnalysisArm {

    fun arm(
        slice: AnalysisSlice,
        result: AnalysisResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<AnalysisSlice> = when (result) {
        // The recall is recorded — including WHICH BRANCH it took — and nothing else.
        is AnalysisResult.RecallAnalysis ->
            ArmOut(slice = slice.withNote(AnalysisNote(now, result.recall)))

        is AnalysisResult.PublishAnalysis ->
            if (result.text.isBlank()) {
                ArmOut(
                    slice = slice,
                    notices = listOf(Notice.Rejected(now, result.tool, "a conclusion cannot be blank")),
                )
            } else {
                ArmOut(
                    slice = slice.withPublished(result.text),
                    effects = listOf(AnalysisEffect.PublishConclusion(now, result.text)),
                )
            }
    }
}
