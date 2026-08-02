// ── spine/pure/context — the reasoner's input, as a named seam (G15) ───────
// The agent's own input context used to be the one seam with no type, no
// projection, no bound, no capture rule and no test layer. It is now the THIRD
// pure projection, beside State→ViewModel and the fold:
//
//     projectContext(state, staged) -> Context        PURE. No I/O, no clock.
//     ContextRenderer().render(context)               -> String         PURE. Exactly what the model saw.
//
// It is RECOMPUTED FROM COMMITTED STATE EVERY STEP — never appended to, never a
// mutable accumulator. That, plus the [ContextBounds] the root wires, is the whole
// growth bound: |Context| is O(1) in timeline length. The two numbers are the
// SHIPPED DEFAULT and not the law (docs/DECISIONS.md:174): what is fixed is that a
// bound is declared and travels as one value, not which number it holds.
//
// The rendered digest plus the active prompt version ride the committed record as
// an ordered fixture (ContextFixture), so an audit can answer "why did the agent
// decide this?" and the replay harness can assert the digest still matches — which
// catches a change to projectContext that silently alters what the model sees,
// WITHOUT re-running the model.
//
// SCOPE, STATED (6.11). **The context SEAM is in scope; context ENGINEERING is not.**
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

/** Each block's contextLines() returns at most this many lines — the SHIPPED DEFAULT. */
const val MAX_CONTEXT_LINES_PER_BLOCK = 8

/** Only the most recent notices reach the reasoner — the SHIPPED DEFAULT. */
const val MAX_CONTEXT_NOTICES = 8

/**
 * THE REASONER'S GROWTH BOUND AS A VALUE (docs/DECISIONS.md:174), so a deployment
 * can state its own window without forking the spine — the shape the mailbox
 * deadlines already ship (spine/pure/Mailbox, spine/concurrency/Consumer).
 *
 * WHAT THE INJECTION BUYS THAT A CONSTANT COULD NOT. A constant is both the
 * stamping side and the re-deriving side of the committed digest, so moving it moves
 * both halves in one run and the golden trace stays green — the check re-derives
 * with the same number it committed under and cancels itself. Once the bound is a
 * value the boundary was HANDED, a timeline can be re-derived under a DIFFERENT one,
 * and the divergence that produces is what makes the committed fixture a check of
 * the bound rather than of the projection alone. `ContextTest` holds both halves.
 */
data class ContextBounds(
    val linesPerBlock: Int = MAX_CONTEXT_LINES_PER_BLOCK,
    val notices: Int = MAX_CONTEXT_NOTICES,
)

/** What a root that says nothing inherits. Pinned to its literals by `ContextTest`,
 *  so editing a default above is a red diff rather than a silent change to what
 *  every model saw. */
val DEFAULT_CONTEXT_BOUNDS = ContextBounds()

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

/** What rides the committed record (14.7 + G15): the prompt version and the rendered digest. */
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
