// ── blocks/inbox/slice — what load-shedding LOOKS LIKE, as folded state ────
// 12.2: a busy-drop must be OBSERVABLE, NEVER SILENT. That sentence is only true if
// the drop lands somewhere a human and the model can both see, which means it is
// product state: a slice, a view, a context projection and a blast radius. That is
// the definition of a block (4.5–4.7), which is why the counters live here and not
// in the spine.
//
// Copy-on-write; never mutate the input.

package adr.blocks.inbox

import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK
import adr.spine.pure.SourceName

/**
 * Why an input was dropped. The block's OWN closed set — deliberately not the
 * spine's `ConsumerEvent`.
 *
 * The two sets are joined at the root by app/wire's `report` mapping, which is
 * L1-correct: the spine does not name the block, the block does not name the
 * consumer, and the composition root is the one place allowed to know both.
 */
sealed interface DropReason {
    /** Newest-input-wins superseded it while a turn was in flight (12.2). */
    data object Conflated : DropReason

    /** A redelivered lease whose source key had already been folded (12.2). */
    data object Duplicate : DropReason
}

data class InboxSlice(
    val conflated: Map<SourceName, Int>,
    val duplicates: Map<SourceName, Int>,
    /** BOUNDED: the reasoner's input may not grow with the number of things that broke. */
    val faults: List<String>,
) {
    fun withDrop(source: SourceName, reason: DropReason, count: Int): InboxSlice = when (reason) {
        DropReason.Conflated ->
            copy(conflated = conflated + (source to (conflated[source] ?: 0) + count))

        DropReason.Duplicate ->
            copy(duplicates = duplicates + (source to (duplicates[source] ?: 0) + count))
    }

    fun withFault(line: String): InboxSlice =
        copy(faults = (faults + line).takeLast(MAX_CONTEXT_LINES_PER_BLOCK))

    companion object {
        val empty = InboxSlice(conflated = emptyMap(), duplicates = emptyMap(), faults = emptyList())
    }
}
