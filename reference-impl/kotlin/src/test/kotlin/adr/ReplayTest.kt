package adr

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ReplayTest {

    @Test
    fun `re-folds a recorded timeline deterministically to a golden state and golden effects`() {
        val initial = State.initial(
            listOf(Ticket("4118", "refund not received", Priority.Normal, TicketStatus.Open)),
        )

        // a recorded session: the agent set priority and requested escalation;
        // the host then confirmed (a separate authority), which pages on-call.
        val recorded = listOf(
            RecordedStep(listOf(ToolResult.PrioritySet("4118", Priority.High)), 1000L),
            RecordedStep(listOf(ToolResult.EscalationRequested("4118", Actor.Agent)), 1001L),
            RecordedStep(listOf(ToolResult.EscalationConfirmed("4118", Actor.Human)), 1002L),
        )

        // `replay` folds twice and asserts the two are identical — it throws if not.
        val (state, effects) = initial.replay(recorded)

        val t = state.tickets.getValue("4118")
        assertEquals(Priority.High, t.priority)
        assertTrue(t.status is TicketStatus.Escalated)

        assertEquals(
            listOf(
                Effect.Log("priority", "4118", Priority.High, 1000L),
                Effect.PageOncall("4118", 1002L),
            ),
            effects,
        )
    }
}
