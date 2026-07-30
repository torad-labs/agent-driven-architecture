// ── test/spine/action — G1: the ONE name→ToolResult map ───────────────────
// The conversion the shipped reference never named. ToolResult appeared three times
// in 1885 lines of prose and in neither the glossary nor the nomenclature table,
// though 17.6 opens "the gate keys off names".

package adr.spine

import adr.Driver
import adr.app.Env
import adr.app.RunAuthority
import adr.app.Wiring
import adr.app.World
import adr.blocks.triage.SET_PRIORITY
import adr.contract.ToolResult
import adr.contract.TriageResult
import adr.spine.pure.Actor
import adr.spine.pure.ToolName
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ActionTest {

    @Test
    fun `an unregistered name folds and commits as Unhandled - never a silent drop`() {
        val app = Wiring().wireApp(Env())
        Driver().human(app, ToolName("noSuchTool"))

        val record = app.bus.records().last()
        assertEquals(
            ToolResult.Unhandled(ToolName("noSuchTool"), "no registered verb"),
            record.results.last(),
        )
        // 6.5: it is COMMITTED, and it is SIGNED — a refusal to act is still a decision.
        assertEquals(ToolName("noSuchTool"), record.commands.last().tool)
        assertEquals("ok", app.controller.view.root.banner, "per-item, never session-global")
    }

    @Test
    fun `an input that fails to decode folds and commits as Unhandled`() {
        val app = Wiring().wireApp(Env())
        Driver().human(app, SET_PRIORITY, "ticket" to "4118", "level" to "Nope")

        val result = app.bus.records().last().results.last()
        assertTrue(result is ToolResult.Unhandled)
        assertEquals("input failed to decode", result.note)
        assertTrue(
            app.performed.none { it.effect is adr.contract.TriageEffect },
            "no domain effect fires for an action that never produced a domain result",
        )
    }

    @Test
    fun `G1 - the human path and the agent path resolve IDENTICALLY`() {
        val agentApp = Wiring().wireApp(Env(authority = RunAuthority(), world = World()))
        val humanApp = Wiring().wireApp(Env(authority = RunAuthority(), world = World()))

        Driver().agent(agentApp, SET_PRIORITY, "ticket" to "4118", "level" to "High")
        Driver().human(humanApp, SET_PRIORITY, "ticket" to "4118", "level" to "High")

        val a = agentApp.bus.records().single()
        val h = humanApp.bus.records().single()

        // 3.2 made true and tested: same ToolResult, same Effect, same state delta.
        assertEquals(a.results, h.results)
        assertEquals(
            TriageResult.SetPriority(
                SET_PRIORITY,
                adr.spine.pure.TicketId("4118"),
                adr.contract.TriageResult.Priority.High,
                reason = null,
            ),
            a.results.single(),
        )
        assertEquals(agentApp.performed.map { it.effect }, humanApp.performed.map { it.effect })
        assertEquals(agentApp.state.triage, humanApp.state.triage)

        // …and the ONLY difference in the committed record is the signature.
        assertEquals(Actor.Agent, a.commands.single().sig.by)
        assertEquals(Actor.Human, h.commands.single().sig.by)
        assertEquals(a.commands.single().tool, h.commands.single().tool)
    }
}
