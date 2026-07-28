// ── blocks/analysis/register — THE ONE PUBLIC SYMBOL (G11) ─────────────
// Everything the composition root needs from this block, bundled. Plug the tier rung
// in by constructing it at app/wire; pull it out by deleting this folder and those
// lines. A SECOND TIER IS OPTIONAL (11's own framing) — nothing in the four shipped
// blocks names anything in here, so removing it costs them nothing.
//
// Three registration builders, not one, because a tier is an ALLOWLIST (11.4): the
// block declares which of its verbs belong to which tier, and the root composes the
// tiers. A fast tier wired with [registerFast] has no `publishAnalysis` in its
// registry at all.
//
// THOSE THREE ARE WHY `register` IS NOT ON THE `Block` INTERFACE. Five blocks have
// exactly one registration builder and this one has three, so pinning `register` to
// the shared seam would either force the other five to grow tiers they do not have or
// force the root to special-case this block. `Block` therefore pins only `arm` and
// `view` — what all six genuinely share — and a block's extra roles stay ordinary
// members that the compiler still checks.

package adr.blocks.analysis

import adr.contract.AnalysisResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Block
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Lens
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class AnalysisBlock : Block<AnalysisSlice, AnalysisResult, AnalysisView> {

    private val armImpl = AnalysisArm()
    private val projection = AnalysisProjection()

    /** Both halves — the single-process default, where one agent does both jobs. */
    fun <S> register(lens: Lens<S, AnalysisSlice>): BlockRegistration<S> =
        AnalysisTools(lens).let {
            BlockRegistration(block = "analysis", verbs = it.fastVerbs() + it.deepVerbs())
        }

    /** The hot loop: it may RECALL and may not publish. */
    fun <S> registerFast(lens: Lens<S, AnalysisSlice>): BlockRegistration<S> =
        BlockRegistration(block = "analysis", verbs = AnalysisTools(lens).fastVerbs())

    /** The deep tier: it may PUBLISH and has no reason to recall its own output. */
    fun <S> registerDeep(lens: Lens<S, AnalysisSlice>): BlockRegistration<S> =
        BlockRegistration(block = "analysis", verbs = AnalysisTools(lens).deepVerbs())

    override fun arm(
        slice: AnalysisSlice,
        result: AnalysisResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<AnalysisSlice> = armImpl.arm(slice, result, now, sig)

    override fun view(slice: AnalysisSlice): AnalysisView = projection.view(slice)

    fun contextLines(slice: AnalysisSlice): List<String> = projection.contextLines(slice)
}
