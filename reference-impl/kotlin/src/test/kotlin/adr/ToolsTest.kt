package adr

import kotlin.test.Test
import kotlin.test.assertEquals

class ToolsTest {

    private val ctx = Ctx(
        state = State.initial(listOf(Ticket("4118", "x", Priority.Normal, TicketStatus.Open))),
        actor = Actor.Agent,
    )

    @Test
    fun `a domain tool returns a payload and mutates nothing`() {
        val r = setPriority.run(SetPriorityInput("4118", Priority.High), ctx)
        assertEquals(ToolResult.PrioritySet("4118", Priority.High), r)
        // the context is unchanged — the tool was never handed a way to write it
        assertEquals(Priority.Normal, ctx.state.tickets.getValue("4118").priority)
    }

    @Test
    fun `a UI tool reads ctx read-only`() {
        assertEquals(ToolResult.Focused("4118", true), focusTicket.run(TicketInput("4118"), ctx))
        assertEquals(ToolResult.Focused("9999", false), focusTicket.run(TicketInput("9999"), ctx))
    }
}
