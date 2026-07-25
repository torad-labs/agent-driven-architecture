// ── spine/pure/context — the reasoner's input, as a named seam (F4/G15) ────
// The agent's own input context used to be the one seam with no type, no
// projection, no bound, no capture rule and no test layer. It is now the THIRD
// pure projection, beside State→ViewModel and the fold:
//
//     projectContext(state, staged) -> Context        PURE. No I/O, no clock.
//     ContextRenderer().render(context)               -> String         PURE. Exactly what the model saw.
//
// It is RECOMPUTED FROM COMMITTED STATE EVERY STEP — never appended to, never a
// mutable accumulator. That, plus the two constants below, is the whole growth
// bound: |Context| is O(1) in timeline length.
//
// The rendered digest plus the active prompt version ride the committed record as
// an ordered fixture (ContextFixture), so an audit can answer "why did the agent
// decide this?" and the replay harness can assert the digest still matches — which
// catches a change to projectContext that silently alters what the model sees,
// WITHOUT re-running the model.
//
// SCOPE, STATED (A3). **The context SEAM is in scope; context ENGINEERING is not.**
// In scope, specified and enforced: this projection is pure, it is bounded, the
// rendered text is exactly what the model saw, and that text plus the active prompt
// version ride the committed record. Out of scope and PRODUCT-OWNED — beside
// authorization, persistence & retention and configuration/secrets: WHAT you choose
// to project, how you rank, retrieve or compact it, and how you author the prompt.
// The architecture's whole obligation is the invariant, not the strategy: whatever
// you project is a pure function of committed State plus staged input, and if you
// compact, THE SUMMARY IS A CAPTURED FIXTURE — because "why did the agent decide
// this?" is unanswerable without the text the model actually read.

package adr.spine.pure

/** Each block's contextLines() returns at most this many lines. */
const val MAX_CONTEXT_LINES_PER_BLOCK = 8

/** Only the most recent notices reach the reasoner. */
const val MAX_CONTEXT_NOTICES = 8

data class Context(
    /**
     * The off-bus inputs this step consumed, IN THEIR STAGING ORDER (5.4). Pinned:
     * [StagedInput.Perceived] first, [StagedInput.Recalled] second. The order
     * reaches the rendered digest and therefore the committed fixture, so it is law
     * rather than style. The sealed set itself lives in spine/pure/staged.
     */
    val staged: List<StagedInput>,
    val lines: List<String>,
    val notices: List<String>,
    /** The artifact by COUNT — never its lines. This is why the artifact cannot inflate the prompt. */
    val artifactLineCount: Int,
)

/** What rides the committed record (14.7 + F4): the prompt version and the rendered digest. */
data class ContextFixture(val promptVersion: String, val digest: String)

/**
 * The exact text the reasoner sees. Pure and total, so the fixture check is meaningful.
 *
 * A CONSTRUCTED type: the two line-formatters below are its own private members, which
 * is what they always were in spirit — `private` at file scope still means anything in
 * the module can be handed them, and neither could be exercised without calling render.
 */
class ContextRenderer {

    fun render(context: Context): String = buildString {
        append("staged: ").append(context.staged.size).append(" input(s)").append('\n')
        context.staged.forEach { append("> ").append(stagedLine(it)).append('\n') }
        context.lines.forEach { append("- ").append(it).append('\n') }
        context.notices.forEach { append("! ").append(it).append('\n') }
        append("artifact: ").append(context.artifactLineCount).append(" line(s)")
    }

    /** One rendered line per staged input, in order. Closed match, no else arm (C9). */
    private fun stagedLine(input: StagedInput): String = when (input) {
        is StagedInput.Perceived -> "${input.source.value} — ${input.body}"
        is StagedInput.Recalled -> "${input.source.value} — ${recallLine(input.recall)}"
    }

    /**
     * The reasoner is told WHICH BRANCH the recall took. A fourth Recall variant breaks
     * the build here, which is the point: stale is LABELLED stale in the prompt itself
     * and is never rendered as though it were fresh.
     */
    private fun recallLine(recall: Recall): String = when (recall) {
        is Recall.Fresh -> "conclusion (fresh, published at ${recall.publishedAt.value}): ${recall.text}"

        is Recall.LastKnown ->
            "conclusion (LAST KNOWN, published at ${recall.publishedAt.value}): ${recall.text}"

        Recall.Empty -> "no conclusion published"
    }
}
