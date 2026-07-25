// ── blocks/analysis/register — THE ONE PUBLIC SYMBOL (I7, L1) ──────────────
// Everything the composition root needs from this block, bundled. Plug the tier rung
// in by registering it at app/wire; pull it out by deleting this folder and those
// lines. A SECOND TIER IS OPTIONAL (11's own framing) — nothing in the four shipped
// blocks names anything in here, so removing it costs them nothing.
//
// Three registration builders, not one, because a tier is an ALLOWLIST (11.4): the
// block declares which of its verbs belong to which tier, and the root composes the
// tiers. A fast tier wired with [registerFast] has no `publishAnalysis` in its
// registry at all.

package adr.blocks.analysis

import adr.contract.AnalysisResult
import adr.spine.pure.ArmOut
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

object Analysis {
    val initial: AnalysisSlice get() = AnalysisSlice.empty

    /** Both halves — the single-process default, where one agent does both jobs. */
    fun <S> register(lens: (S) -> AnalysisSlice): BlockRegistration<S> =
        BlockRegistration(block = "analysis", verbs = analysisFastVerbs(lens) + analysisDeepVerbs(lens))

    /** The hot loop: it may RECALL and may not publish. */
    fun <S> registerFast(lens: (S) -> AnalysisSlice): BlockRegistration<S> =
        BlockRegistration(block = "analysis", verbs = analysisFastVerbs(lens))

    /** The deep tier: it may PUBLISH and has no reason to recall its own output. */
    fun <S> registerDeep(lens: (S) -> AnalysisSlice): BlockRegistration<S> =
        BlockRegistration(block = "analysis", verbs = analysisDeepVerbs(lens))

    fun arm(
        slice: AnalysisSlice,
        result: AnalysisResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<AnalysisSlice> = analysisArm(slice, result, now, sig)

    fun view(slice: AnalysisSlice): AnalysisView = analysisView(slice)

    fun contextLines(slice: AnalysisSlice): List<String> = analysisContextLines(slice)
}
