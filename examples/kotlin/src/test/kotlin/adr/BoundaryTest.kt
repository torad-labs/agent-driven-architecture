package adr

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BoundaryTest {

    @Test
    fun `commits before it performs, and stamps the actor exactly once`() {
        val order = mutableListOf<String>()
        val bus = object : Bus {
            override fun append(commands: List<Command>, results: List<ToolResult>) {
                order += "append " + commands.joinToString(",") { "${it::class.simpleName}:${it.by}:${it.id}" }
            }
        }
        val sink = object : Sink {
            override fun perform(effect: Effect, mode: PerformMode) {
                order += "perform ${effect::class.simpleName}"
            }
        }

        val b = Boundary(
            Clock.fixed(42L),
            IdSource.sequential("c"),
            bus,
            sink,
            State.initial(listOf(Ticket("4118", "x", Priority.Normal, TicketStatus.Open))),
        )

        b.onStepFinish(FinishedStep(Actor.Agent, listOf(ToolResult.PrioritySet("4118", Priority.High))))

        // commit (the signed command, actor stamped) strictly before perform
        assertEquals(listOf("append SetPriority:Agent:c1", "perform Log"), order)
        assertEquals(Priority.High, b.state.tickets.getValue("4118").priority)
    }

    @Test
    fun `never forges the actor — a human action carries Human through the same path`() {
        val seen = mutableListOf<Command>()
        val bus = object : Bus {
            override fun append(commands: List<Command>, results: List<ToolResult>) {
                seen += commands
            }
        }
        val sink = object : Sink {
            override fun perform(effect: Effect, mode: PerformMode) {}
        }
        val b = Boundary(
            Clock.fixed(1L),
            IdSource.sequential(),
            bus,
            sink,
            State.initial(listOf(Ticket("4118", "x", Priority.Normal, TicketStatus.Open))),
        )

        b.onStepFinish(FinishedStep(Actor.Human, listOf(ToolResult.PrioritySet("4118", Priority.Urgent))))

        val first = seen.first()
        assertTrue(first is Command.SetPriority && first.by == Actor.Human)
    }
}
