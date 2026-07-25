// ── test/blocks/console — A1: a presentation block, tested like any other ─
// Read this file next to TriageBlockTest. There is no difference to find: the same
// arm shape, the same rejection rule, the same signed Command. That is A1.

package adr.blocks

import adr.blocks.console.ConsoleBlock
import adr.blocks.console.ConsoleProjection
import adr.blocks.console.ConsoleSlice
import adr.blocks.console.FOCUS_TICKET
import adr.blocks.console.SET_PANEL
import adr.blocks.console.ViewState
import adr.contract.ConsoleResult
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.Notice
import adr.spine.pure.PanelId
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ConsoleBlockTest {

    private val now = Timestamp(9)
    private val sig = Signature(Actor.Agent, Authority("agent-run-7f"))
    private val slice = ConsoleBlock().slice(listOf(PanelId("queue"), PanelId("detail")))

    /** The block is CONSTRUCTED here — no root, no registry, no boundary (G13). */
    private val block = ConsoleBlock()

    @Test
    fun `a presentation decision FOLDS - it is truth, by 4_6's own test`() {
        val out = block.arm(slice, ConsoleResult.FocusTicket(FOCUS_TICKET, TicketId("4118")), now, sig)
        assertEquals(TicketId("4118"), out.slice.focused)
        assertTrue(out.effects.isEmpty(), "a presentation verb changes belief, not the world")
    }

    @Test
    fun `a presentation arm reads state and rejects per-item, exactly like a domain arm`() {
        val out = block.arm(slice, ConsoleResult.SetPanel(SET_PANEL, PanelId("ghost"), true), now, sig)

        assertEquals(slice, out.slice)
        assertIs<Notice.Rejected>(out.notices.single())
        assertEquals("no panel named ghost", out.notices.single().reason)
    }

    @Test
    fun `setPanel folds the agent's layout decision`() {
        val out = block.arm(slice, ConsoleResult.SetPanel(SET_PANEL, PanelId("detail"), true), now, sig)
        assertEquals(true, out.slice.panels.getValue(PanelId("detail")))
    }

    @Test
    fun `EPHEMERAL view-state joins only at the projection, and never travels back`() {
        val folded = block.arm(slice, ConsoleResult.FocusTicket(FOCUS_TICKET, TicketId("4118")), now, sig).slice
        val ephemeral = ViewState(hover = TicketId("9999"), scrollOffset = 120, draft = "not submitted")

        // The PROJECTION is constructed directly: the ephemeral half is visible only
        // here, never through the block's own `view(slice)` (gate check C12).
        val view = ConsoleProjection().view(folded, ephemeral)

        assertEquals("4118", view.focused, "folded truth")
        assertEquals("9999", view.hovered, "ephemeral, rendered only")
        assertEquals(120, view.scrollOffset)
        assertEquals("not submitted", view.draft)
        // …and the slice knows nothing about any of it.
        assertEquals(TicketId("4118"), folded.focused)
        assertEquals(setOf(PanelId("queue"), PanelId("detail")), folded.panels.keys)
    }
}
