// ── blocks/console/slice — presentation TRUTH, folded like any other ───────
// 4.6's test, verbatim: if losing the field on a re-fold would change what the
// system believes or what the artifact contains, it is truth — fold it. Which panel
// the agent decided to open is a decision someone made and a reader may need to
// audit ("why did the escalation button disappear?"). It folds.

package adr.blocks.console

import adr.spine.pure.PanelId
import adr.spine.pure.TicketId

data class ConsoleSlice(
    val focused: TicketId? = null,
    val panels: Map<PanelId, Boolean> = emptyMap(),
) {
    // No companion: a companion member has no instance, the same defect as a top-level
    // function. The EMPTY slice is what the primary constructor builds when told
    // nothing — `ConsoleSlice()` — so the shape carries its own starting value.
    fun withFocus(ticket: TicketId): ConsoleSlice = copy(focused = ticket)

    fun withPanel(panel: PanelId, visible: Boolean): ConsoleSlice =
        copy(panels = panels + (panel to visible))
}
