package adr

import ai.torad.aisdk.providers.mockLanguageModelToolThenText
import ai.torad.aisdk.providers.mockToolInput
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AgentTest {

    @Test
    fun `runs a real ToolLoopAgent loop offline - the agent calls setPriority, the boundary folds it`() =
        runBlocking {
            // Script the model with NO network: step 1 calls setPriority; step 2 finishes.
            val model = mockLanguageModelToolThenText(
                toolName = "setPriority",
                toolInput = mockToolInput("ticket" to "4118", "level" to "High"),
                finalText = "Priority set to High.",
            )

            val bus = RecordingBus()
            val performed = mutableListOf<Effect>()
            val sink = object : Sink {
                override fun perform(effect: Effect, mode: PerformMode) {
                    performed += effect
                }
            }
            val boundary = Boundary(
                Clock.fixed(7L),
                IdSource.sequential("c"),
                bus,
                sink,
                State.initial(
                    listOf(Ticket("4118", "refund not received", Priority.Normal, TicketStatus.Open)),
                ),
            )

            val agent = TriageAgent(model, boundary)
            val out = agent.runTurn("ticket 4118 looks urgent")

            // the real loop ran two steps (tool call, then finish)
            assertEquals(2, out.steps)
            // the boundary folded the agent's tool result → domain state updated
            assertEquals(Priority.High, boundary.state.tickets.getValue("4118").priority)
            // committed as a signed Agent command, then the Log effect performed
            assertTrue(bus.commands.any { it is Command.SetPriority && it.by == Actor.Agent })
            assertTrue(performed.any { it is Effect.Log })
        }
}
