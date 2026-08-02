// ── blocks/console/project — where ephemeral state is allowed to join ──────
// The ONLY file permitted to import blocks/console/view-state (gate check C12).
// Folded truth and ephemeral view-state meet here, in a pure projection, at the last
// possible moment — and the ephemeral half never travels back.
//
// THIS IS THE ONE PROJECTION IN THE SYSTEM THAT TAKES A SECOND ARGUMENT, and it is
// why `Block` declares `view(slice)` and nothing wider: the ephemeral half is a
// console-only concern, so it lives on the concrete [ConsoleProjection] where C12 can
// still see it, and never on the shared interface. `ConsoleBlock.view(slice)` takes
// the default, so the root composes this block exactly like the other five.

package adr.blocks.console

import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK

data class PanelRow(val panel: String, val visible: Boolean)

data class ConsoleView(
    val focused: String?,
    val panels: List<PanelRow>,
    /** Ephemeral: rendered, never folded, never signed. */
    val hovered: String?,
    val scrollOffset: Int,
    val draft: String,
)

class ConsoleProjection {

    fun view(slice: ConsoleSlice, ephemeral: ViewState = ViewState()): ConsoleView =
        ConsoleView(
            focused = slice.focused?.value,
            panels = slice.panels.map { (panel, visible) -> PanelRow(panel.value, visible) },
            hovered = ephemeral.hover?.value,
            scrollOffset = ephemeral.scrollOffset,
            draft = ephemeral.draft,
        )

    fun contextLines(slice: ConsoleSlice, maxLines: Int = MAX_CONTEXT_LINES_PER_BLOCK): List<String> =
        (
            listOfNotNull(slice.focused?.let { "the console is focused on ticket ${it.value}" }) +
                slice.panels.filterValues { it }.keys.map { "panel ${it.value} is visible" }
            ).take(maxLines)
}
