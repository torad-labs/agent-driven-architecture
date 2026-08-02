// ── blocks/console/view-state — EPHEMERAL, and the only thing that is (4.6) ─
// Hover, scroll offset, which panel is expanded in THIS browser tab, unsubmitted
// text. None of it enters a tool, folds, or signs — losing it on a re-fold changes
// nothing the system believes and nothing the artifact contains.
//
// Gate check C12 keeps it that way: this file may be imported only by
// blocks/console/project, where ephemeral state joins the pre-decided ViewModel at
// the very last moment. `fold`, `slice`, `contract` and `register` cannot see it.
//
// 6.8's volume objection, answered: the axis is DECISION vs EPHEMERAL, not UI vs
// domain. A deliberate repositioning IS the "discrete, auditable, low-frequency
// action" 5.4 puts on the bus; a scroll offset is not.

package adr.blocks.console

import adr.spine.pure.TicketId

data class ViewState(
    val hover: TicketId? = null,
    val scrollOffset: Int = 0,
    val draft: String = "",
) {
    // No companion: a companion member has no instance, which is the same defect as a
    // top-level function. The EMPTY slice is now what the primary constructor builds
    // when told nothing — `ViewState()` — so the shape carries its own starting value and
    // nothing extra has to exist to hand it over.
}
