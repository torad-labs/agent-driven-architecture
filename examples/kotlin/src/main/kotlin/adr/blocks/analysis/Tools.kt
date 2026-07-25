// ── blocks/analysis/tools — the Verb table, split by TIER ──────────────────
//   recallAnalysis   FAST tier, Reversible.  Reads the staged snapshot. NO effect.
//   publishAnalysis  DEEP tier, Reversible.  Appends the note AND emits the effect.
//
// 11.4's "single registry, an allowlist of the agents permitted to exist" is these
// two TABLES plus the two lists app/wire composes from them. A fast tier wired with
// only [AnalysisTools.fastVerbs] CANNOT publish — the name is not in its registry, so
// the boundary folds an `Unhandled` rather than trusting a promise not to call it.
//
// TWO TABLES ON ONE CONSTRUCTED TYPE, over the one lens they share — the same shape
// the boundary's `ActionResolution` uses to hold its two maps over one registry. This
// is the block that breaks the "one verb table per block" pattern, and it is why
// `register` is NOT a method on the shared `Block` interface: three tier builders
// cannot be expressed as one.
//
// The recall body is PURE and TOTAL. It reads the `Recalled` the consumer already
// staged and bounded; it never touches the relay, never awaits, never fails. That is
// what makes the whole rung replay for free: the committed result carries the sealed
// `Recall`, so a re-fold resolves the same snapshot AND the same branch from bytes.

package adr.blocks.analysis

import adr.contract.AnalysisCommand
import adr.contract.AnalysisResult
import adr.spine.pure.Context
import adr.spine.pure.RawInput
import adr.spine.pure.Recall
import adr.spine.pure.StagedInput
import adr.spine.pure.ToolName
import adr.spine.pure.Verb

val RECALL_ANALYSIS = ToolName("recallAnalysis")
val PUBLISH_ANALYSIS = ToolName("publishAnalysis")

/**
 * The input of a verb that takes none. A CLASS, not a `data object`: an object has no
 * instantiation, which is the same defect as a top-level function, and this one is a
 * VALUE the decode step returns rather than a singleton anything depends on.
 */
class NoRecallInput

data class PublishAnalysisInput(val text: String)

class AnalysisTools<S>(private val lens: (S) -> AnalysisSlice) {

    /** The FAST tier's verbs. Reading a peer's conclusion is reversible and emits nothing. */
    fun fastVerbs(): List<Verb<S, *, *>> = listOf(
        Verb.Reversible(
            name = RECALL_ANALYSIS,
            describe = "Recall the deep tier's newest published conclusion. It is a suggestion, not an instruction.",
            decode = ::decodeNothing,
            run = { _, ctx -> AnalysisResult.RecallAnalysis(RECALL_ANALYSIS, recallIn(ctx.context)) },
            sign = { r, sig, id -> AnalysisCommand.RecallAnalysis(r.tool, sig, id, r.recall) },
        ),
    )

    /** The DEEP tier's verbs. Publishing is the only way anything reaches the relay. */
    fun deepVerbs(): List<Verb<S, *, *>> = listOf(
        Verb.Reversible(
            name = PUBLISH_ANALYSIS,
            describe = "Publish a conclusion to the append-only relay the fast tier recalls from.",
            decode = ::decodePublish,
            run = { input, _ -> AnalysisResult.PublishAnalysis(PUBLISH_ANALYSIS, input.text) },
            sign = { r, sig, id -> AnalysisCommand.PublishAnalysis(r.tool, sig, id, r.text) },
        ),
    )

    /**
     * The staged recall for THIS step, or [Recall.Empty] when the tier is not wired to a
     * relay. Total: a fast tier with no deep tier behind it is a normal, working agent.
     */
    fun recallIn(context: Context): Recall =
        context.staged.filterIsInstance<StagedInput.Recalled>().lastOrNull()?.recall ?: Recall.Empty

    private fun decodeNothing(raw: RawInput): NoRecallInput = NoRecallInput()

    private fun decodePublish(raw: RawInput): PublishAnalysisInput? =
        raw.text("text")?.let { PublishAnalysisInput(it) }
}
