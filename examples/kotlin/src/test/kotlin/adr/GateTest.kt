package adr

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GateTest {

    private fun escalating(by: Actor = Actor.Agent): State =
        State.initial(listOf(Ticket("4118", "x", Priority.High, TicketStatus.Escalating(by))))

    @Test
    fun `pages on a host (Human) confirm`() {
        val (s, fx) = Reducer.fold(
            escalating(),
            listOf(ToolResult.EscalationConfirmed("4118", Actor.Human)),
            5L,
        )
        assertTrue(s.tickets.getValue("4118").status is TicketStatus.Escalated)
        assertEquals(listOf(Effect.PageOncall("4118", 5L)), fx)
    }

    @Test
    fun `denies an agent self-confirm — no page fires`() {
        val (s, fx) = Reducer.fold(
            escalating(),
            listOf(ToolResult.EscalationConfirmed("4118", Actor.Agent)),
            5L,
        )
        // status unchanged: still Escalating, never Escalated
        assertTrue(s.tickets.getValue("4118").status is TicketStatus.Escalating)
        assertEquals(listOf(Effect.Diag("denied: agent self-confirm")), fx)
        assertFalse(fx.any { it is Effect.PageOncall })
    }
}
