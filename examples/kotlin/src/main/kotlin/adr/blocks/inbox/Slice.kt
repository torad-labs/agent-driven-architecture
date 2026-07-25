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
enum class DropReason {
    /** Newest-input-wins superseded it while a turn was in flight (12.2). */
    Conflated,

    /** A redelivered lease whose source key had already been folded (12.2). */
    Duplicate,
    ;

    /**
     * The ONE seam from an external token to this closed set — the `fromToken()` the
     * stringly-dispatch law asks for. It replaces a `when` over string literals, which
     * is open-world dispatch: adding a variant there was a silent fall-through to
     * `else -> null` rather than a compile error. Derived from `entries`, so a new
     * variant is admitted automatically and cannot be forgotten.
     *
     * Still guarded, and still total: an unrecognised word is a decode failure (null),
     * never a default.
     */
    fun interface Parser {
        fun parse(token: String): DropReason?
    }
}

data class InboxSlice(
    val conflated: Map<SourceName, Int> = emptyMap(),
    val duplicates: Map<SourceName, Int> = emptyMap(),
    /** BOUNDED: the reasoner's input may not grow with the number of things that broke. */
    val faults: List<String> = emptyList(),
) {
    // No companion: a companion member has no instance, which is the same defect as a
    // top-level function. The EMPTY slice is now what the primary constructor builds
    // when told nothing — `InboxSlice()` — so the shape carries its own starting value and
    // nothing extra has to exist to hand it over.
    fun withDrop(source: SourceName, reason: DropReason, count: Int): InboxSlice = when (reason) {
        DropReason.Conflated ->
            copy(conflated = conflated + (source to (conflated[source] ?: 0) + count))

        DropReason.Duplicate ->
            copy(duplicates = duplicates + (source to (duplicates[source] ?: 0) + count))
    }

    fun withFault(line: String): InboxSlice =
        copy(faults = (faults + line).takeLast(MAX_CONTEXT_LINES_PER_BLOCK))
}
