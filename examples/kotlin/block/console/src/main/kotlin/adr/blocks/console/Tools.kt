// ── blocks/console/tools — presentation verbs, authored EXACTLY like domain ones ─
// Same five properties, same signer, same registry, same four sites (§11.1). Put
// this file beside blocks/triage/tools and read them together: there is no
// difference to find, which is the point of 6.8.

package adr.blocks.console

import adr.contract.ConsoleCommand
import adr.contract.ConsoleResult
import adr.spine.pure.Lens
import adr.spine.pure.PanelId
import adr.spine.pure.RawInput
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName
import adr.spine.pure.Verb

val FOCUS_TICKET = ToolName("focusTicket")
val SET_PANEL = ToolName("setPanel")

internal data class FocusInput(val ticket: TicketId)

internal data class PanelInput(val panel: PanelId, val visible: Boolean)

internal class ConsoleTools<S>(private val lens: Lens<S, ConsoleSlice>) {

    fun verbs(): List<Verb<S, *, *>> = listOf(
        Verb.Reversible(
            name = FOCUS_TICKET,
            describe = "Bring a ticket into focus on the console.",
            decode = ::decodeFocus,
            run = { input, _ -> ConsoleResult.FocusTicket(FOCUS_TICKET, input.ticket) },
            sign = { r, sig, id -> ConsoleCommand.FocusTicket(r.tool, sig, id, r.ticket) },
            narrow = { it as? ConsoleResult.FocusTicket },
        ),
        Verb.Reversible(
            name = SET_PANEL,
            describe = "Show or hide a console panel (queue | detail | audit).",
            decode = ::decodePanel,
            run = { input, _ -> ConsoleResult.SetPanel(SET_PANEL, input.panel, input.visible) },
            sign = { r, sig, id -> ConsoleCommand.SetPanel(r.tool, sig, id, r.panel, r.visible) },
            narrow = { it as? ConsoleResult.SetPanel },
        ),
    )

    private fun decodeFocus(raw: RawInput): FocusInput? =
        raw.text("ticket")?.let { FocusInput(TicketId(it)) }

    private fun decodePanel(raw: RawInput): PanelInput? {
        val panel = raw.text("panel") ?: return null
        val visible = raw.flag("visible") ?: return null
        return PanelInput(PanelId(panel), visible)
    }
}
