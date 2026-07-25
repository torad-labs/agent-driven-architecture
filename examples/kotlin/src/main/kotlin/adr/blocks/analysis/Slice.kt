// ── blocks/analysis/slice — the tier's own state ───────────────────────────
// Copy-on-write; never mutate the input. Structural equality is what makes the
// replay comparison meaningful (14.1) — and here it is doing real work: the note
// stores the WHOLE sealed `Recall`, so a re-folded timeline can be compared variant
// for variant against the live one.

package adr.blocks.analysis

import adr.spine.pure.Recall
import adr.spine.pure.Timestamp

/**
 * One recall, as it was actually resolved. The variant is kept, not flattened to
 * text: `Fresh("x")` and `LastKnown("x")` are different facts about the same string,
 * and an audit that cannot tell them apart cannot answer "was the agent reasoning
 * over stale input?".
 */
data class AnalysisNote(val at: Timestamp, val recall: Recall)

data class AnalysisSlice(
    val notes: List<AnalysisNote>,
    /** What THIS tier published. A fast tier never has any; a deep tier's is its output. */
    val published: List<String>,
) {
    fun withNote(note: AnalysisNote): AnalysisSlice = copy(notes = notes + note)

    fun withPublished(text: String): AnalysisSlice = copy(published = published + text)

    companion object {
        val empty = AnalysisSlice(notes = emptyList(), published = emptyList())
    }
}
