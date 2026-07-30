// ── blocks/analysis/project — TWO pure projections of the SAME slice ───────
// slice → view    what a human reads      (6.9, the Presenter)
// slice → lines   what the reasoner reads (G15, the third projection)
//
// BOTH are exhaustive `when`s over `Recall`'s three variants with no else arm, so
// `Recall` gets exactly the three-consumer treatment `TicketStatus` has (G12's
// pattern, proved again): adding a fourth variant breaks the build at both sites
// here plus `render` in spine/pure/context, and the compiler names each one.
//
// The property both matches exist to hold: **STALE IS NEVER PRESENTED AS FRESH, and
// "nothing published yet" is never presented as stale.** A `LastKnown` says so in
// the operator's row and in the model's prompt; `Empty` says "none published".

package adr.blocks.analysis

import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK
import adr.spine.pure.Recall

data class AnalysisRow(val at: Long, val freshness: String, val text: String)

data class AnalysisView(val recalls: List<AnalysisRow>, val published: List<String>)

class AnalysisProjection {

    fun view(slice: AnalysisSlice): AnalysisView = AnalysisView(
        recalls = slice.notes.map { note ->
            AnalysisRow(
                at = note.at.value,
                freshness = freshnessOf(note.recall),
                text = note.recall.text,
            )
        },
        published = slice.published,
    )

    fun contextLines(slice: AnalysisSlice): List<String> =
        slice.notes
            .takeLast(MAX_CONTEXT_LINES_PER_BLOCK)
            .map { "recalled: ${contextWordFor(it.recall)}" }

    /** The operator's word for the branch. Closed match, no else arm. */
    private fun freshnessOf(recall: Recall): String = when (recall) {
        is Recall.Fresh -> "fresh"
        is Recall.LastKnown -> "stale (last known)"
        Recall.Empty -> "none published"
    }

    /**
     * The model's word for the branch. A SEPARATE closed match from the view's, because
     * the reasoner needs the caveat spelled out ("do not act on this as current") where
     * an operator only needs a badge.
     */
    private fun contextWordFor(recall: Recall): String = when (recall) {
        is Recall.Fresh ->
            "the deep tier's conclusion, current as of ${recall.publishedAt.value} — ${recall.text}"

        is Recall.LastKnown ->
            "the deep tier's LAST KNOWN conclusion from ${recall.publishedAt.value}; it may be out of " +
                "date — ${recall.text}"

        Recall.Empty -> "the deep tier has published no conclusion yet"
    }
}
