// ── A runnable, offline end-to-end demo (`./gradlew run`) ───────────────────
// No API keys, no network: a scripted model drives the real agent loop, the
// boundary folds each step, and the gate is shown holding both ways.

package adr

import ai.torad.aisdk.providers.mockLanguageModelToolThenText
import ai.torad.aisdk.providers.mockToolInput
import kotlinx.coroutines.runBlocking

// a deterministic, monotonically increasing clock for stable demo output
private fun tickingClock(): Clock = object : Clock {
    private var t = 1000L
    override fun now(): Long {
        t += 1
        return t
    }
}

fun main(): Unit = runBlocking {
    // 1) An agent turn, scripted offline: the agent calls setPriority, then finishes.
    val model = mockLanguageModelToolThenText(
        toolName = "setPriority",
        toolInput = mockToolInput("ticket" to "4118", "level" to "High"),
        finalText = "Set #4118 to High.",
    )

    val performed = mutableListOf<Effect>()
    val sink = object : Sink {
        override fun perform(effect: Effect, mode: PerformMode) {
            performed += effect
        }
    }
    val boundary = Boundary(
        clock = tickingClock(),
        ids = IdSource.sequential("cmd"),
        bus = RecordingBus(),
        sink = sink,
        initial = State.initial(
            listOf(Ticket("4118", "refund not received", Priority.Normal, TicketStatus.Open)),
        ),
    )

    val agent = TriageAgent(model, boundary)
    val turn = agent.runTurn("ticket 4118 looks urgent")
    println("\n[agent] ran ${turn.steps} steps, said: \"${turn.text}\"")
    println("[state] after the agent set priority: ${boundary.state.project().rows.first()}")

    // 2) The host requests escalation out-of-band (a person, carrying Actor.Human).
    boundary.onStepFinish(
        FinishedStep(Actor.Human, listOf(ToolResult.EscalationRequested("4118", Actor.Human))),
    )

    // 3) An AGENT tries to self-confirm — the gate DENIES it; no page fires.
    boundary.onStepFinish(
        FinishedStep(Actor.Agent, listOf(ToolResult.EscalationConfirmed("4118", Actor.Agent))),
    )
    println("\n[gate] agent self-confirm → ${performed.last()}")

    // 4) The HOST confirms (out-of-band) — the page finally fires.
    boundary.onStepFinish(
        FinishedStep(Actor.Human, listOf(ToolResult.EscalationConfirmed("4118", Actor.Human))),
    )
    println("[gate] host confirm    → ${performed.last()}")

    println("\n[effects performed] ${performed.joinToString(" · ") { it::class.simpleName ?: "?" }}")
    println("[final state] ${boundary.state.project().rows.first()}\n")
}
