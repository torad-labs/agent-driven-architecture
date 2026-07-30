// ── blocks/inbox/slice — what load-shedding LOOKS LIKE, as folded state ────
// 12.2: a busy-drop must be OBSERVABLE, NEVER SILENT. That sentence is only true if
// the drop lands somewhere a human and the model can both see, which means it is
// product state: a slice, a view, a context projection and a blast radius. That is
// the definition of a block (4.5–4.7), which is why the counters live here and not
// in the spine.
//
// Copy-on-write; never mutate the input.

package adr.blocks.inbox

import adr.contract.InboxResult.DropReason
import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK
import adr.spine.pure.SourceName

// `DropReason` is declared on this block's own sealed transport root, in
// blocks/inbox/Contract.kt, because both `InboxResult.NoteDrop` and
// `InboxCommand.NoteDrop` carry one and Kotlin's sealed rule authors that file inside
// `:spine` (ADR-001 §3). C2 admits the import by name prefix.

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
