// ── blocks/console/contract — A PRESENTATION BLOCK, and it SIGNS (A1) ──────
// 6.8's "a UI tool folds, does not sign" carve-out is deleted. An agent that can
// show/hide, reposition and restructure the interface — AUDITABLY AND REPLAYABLY —
// is a primary advantage of this architecture, and unsigning UI tools removes
// exactly that.
//
// FocusTicket and SetPanel are Command cases with the same shape, the same signer,
// the same commit path and the same blast radius as SetPriority. There is no second
// table, no "folds, does not sign" row, and no apologetic caption. 3.2 ("a person
// tapping a control and the agent calling a tool resolve to the identical Command")
// and 4.4 ("the authoring discipline is identical") become true as written.
//
// The axis is 4.6's, untouched: a DECISION about presentation is truth and folds;
// EPHEMERAL local view-state (hover, scroll, unsubmitted text) never enters a tool.
// That line lives in blocks/console/view-state, one file away.

package adr.contract

import adr.spine.pure.CommandId
import adr.spine.pure.PanelId
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

sealed interface ConsoleResult : ToolResult {
    data class FocusTicket(
        override val tool: ToolName,
        val ticket: TicketId,
    ) : ConsoleResult

    data class SetPanel(
        override val tool: ToolName,
        val panel: PanelId,
        val visible: Boolean,
    ) : ConsoleResult
}

sealed interface ConsoleCommand : Command {
    data class FocusTicket(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val ticket: TicketId,
    ) : ConsoleCommand

    data class SetPanel(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val panel: PanelId,
        val visible: Boolean,
    ) : ConsoleCommand
}
