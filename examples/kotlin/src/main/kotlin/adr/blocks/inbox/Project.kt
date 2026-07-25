// ── blocks/inbox/project — TWO pure projections of the SAME slice ──────────
// slice → view    what a human reads      (6.9)
// slice → lines   what the reasoner reads (F4/G15)
//
// THE SECOND ONE IS WHAT MAKES "OBSERVABLE, NEVER SILENT" MEAN SOMETHING. A counter
// only an operator can see tells the agent nothing; a context line tells the
// REASONER it is shedding load, so it can decide to be terser, batch, or ask for
// help. 12.2's requirement is not "log the drop", it is "the drop is visible where
// decisions are made" — and both places where decisions are made get told.
//
// Bounded by the same constant every other block uses, so a storm of drops cannot
// inflate the prompt.

package adr.blocks.inbox

import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK

data class InboxView(
    val conflated: List<String>,
    val duplicates: List<String>,
    val faults: List<String>,
)

fun inboxView(slice: InboxSlice): InboxView = InboxView(
    conflated = slice.conflated.map { (source, count) -> "${source.value}: $count conflated" },
    duplicates = slice.duplicates.map { (source, count) -> "${source.value}: $count duplicate" },
    faults = slice.faults,
)

fun inboxContextLines(slice: InboxSlice): List<String> = (
    slice.conflated.map { (source, count) -> "$count input(s) conflated from ${source.value}" } +
        slice.duplicates.map { (source, count) -> "$count duplicate input(s) from ${source.value}" } +
        slice.faults.map { "turn failed: $it" }
    ).takeLast(MAX_CONTEXT_LINES_PER_BLOCK)
