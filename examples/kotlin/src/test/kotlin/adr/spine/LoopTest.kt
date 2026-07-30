// ── test/spine/loop — the real agent loop, offline ────────────────────────
// A real ToolLoopAgent turn with a scripted model: the loop forwards the model's raw
// tool CALLS as Actions, and the boundary resolves, gates, folds and commits them.

package adr.spine

import adr.app.RunAuthority
import adr.app.World
import adr.app.ScriptedEvents
import adr.app.Env
import adr.app.Wiring
import adr.contract.TriageResult.Priority
import adr.contract.TriageCommand
import adr.contract.TriageEffect
import adr.spine.pure.Actor
import adr.spine.pure.SourceKey
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.TicketId
import ai.torad.aisdk.providers.mockLanguageModelToolThenText
import ai.torad.aisdk.providers.mockToolInput
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LoopTest {

    @Test
    fun `a real ToolLoopAgent turn folds through the boundary and commits a signed Command`() =
        runTest {
            val world = World()
            val staged = StagedInput.Perceived(SourceName("inbox"), "customer says the refund never arrived", SourceKey("inbox-1"))
            val app = Wiring().wireApp(
                Env(world = world, authority = RunAuthority(), events = ScriptedEvents(listOf(staged))),
            )

            val model = mockLanguageModelToolThenText(
                toolName = "setPriority",
                toolInput = mockToolInput("ticket" to "4118", "level" to "High"),
                finalText = "Priority set to High.",
            )
            val out = Wiring().agentLoop(app, Wiring().modelProvider(model), "You triage support tickets.")
                .runTurn("ticket 4118 looks urgent")

            assertEquals(2, out.steps)
            assertEquals(Priority.High, app.state.triage.priority.getValue(TicketId("4118")))
            assertTrue(
                app.bus.records().any { record ->
                    record.commands.any { it is TriageCommand.SetPriority && it.sig.by == Actor.Agent }
                },
            )
            assertTrue(app.performed.any { it.effect is TriageEffect.LogDecision })
            // the sensing seam: what the world offered THIS step rides the committed record (5.4)
            assertEquals(listOf(staged), app.bus.records().first().staged)
        }
}
