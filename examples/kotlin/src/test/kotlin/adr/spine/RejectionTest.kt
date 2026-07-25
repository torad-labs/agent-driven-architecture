// ── test/spine/rejection — F9, end to end through the real boundary ───────
// The block tests exercise each arm in isolation. This file drives the SAME three
// failures through the whole nine-step boundary, because F9's damage was not in
// any one arm: it was that a per-item failure reached the session-global status
// and stayed there.
//
// OLD (all measured against the shipped ports):
//   confirm with NO prior Request (ticket Open)   -> PageOncall fired, status Escalated
//   confirm on a ticket absent from State         -> PageOncall("nope") fired AND run -> Degraded
//   setPriority on unknown ticket 9999            -> Effect.Log performed, SetPriority
//                                                    committed, folded state UNCHANGED
//   withUnhandled hijacked the session run status -> banner "degraded: ..." for the
//                                                    REST OF THE SESSION
//
// Three things are asserted for each: a Rejected/Refused marker IS folded, NO
// effect fires, and the session banner is untouched.

package adr.spine

import adr.agent
import adr.app.RunAuthority
import adr.app.World
import adr.app.offlineEnv
import adr.app.wireApp
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.TicketStatus
import adr.blocks.triage.Priority
import adr.blocks.triage.SET_PRIORITY
import adr.contract.EscalationEffect
import adr.contract.ToolResult
import adr.contract.TriageEffect
import adr.human
import adr.spine.pure.Notice
import adr.spine.pure.RunStatus
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class RejectionTest {

    private val known = TicketId("4118")

    @Test
    fun `F9 - confirm with NO prior request folds a marker and fires nothing`() {
        val world = World()
        val app = wireApp(offlineEnv(world = world, authority = RunAuthority()))

        app.human(CONFIRM_ESCALATION, "ticket" to "4118")

        // The gate refused it PRE-FOLD, so the refusal is what got committed (D5).
        assertEquals(
            ToolResult.Refused(CONFIRM_ESCALATION, "no pending request"),
            app.bus.records().single().results.single(),
        )
        assertTrue(app.performed.none { it.effect is EscalationEffect.PageOncall })
        assertEquals(0, world.pages.size, "the irreversible effect never reached the world")

        // A marker IS folded — a refusal is a decision, not a silence.
        assertIs<Notice.Refused>(app.state.spine.notices.single())

        // …and it stayed per-item.
        assertIs<TicketStatus.Open>(app.state.escalation.statusOf(known))
        assertEquals(RunStatus.Idle, app.state.spine.run)
        assertEquals("ok", app.controller.view.root.banner)
    }

    @Test
    fun `F9 - confirm on an UNKNOWN ticket folds a marker and fires nothing`() {
        val world = World()
        val app = wireApp(offlineEnv(world = world, authority = RunAuthority()))

        app.human(CONFIRM_ESCALATION, "ticket" to "nope")

        assertIs<ToolResult.Refused>(app.bus.records().single().results.single())
        assertTrue(app.performed.none { it.effect is EscalationEffect.PageOncall })
        assertEquals(0, world.pages.size, "measured OLD: PageOncall(\"nope\") fired")

        assertEquals(1, app.state.spine.notices.size)
        assertEquals(RunStatus.Idle, app.state.spine.run, "measured OLD: run -> Degraded")
        assertEquals("ok", app.controller.view.root.banner)
    }

    @Test
    fun `F9 - setPriority on an unknown ticket mutates nothing and fires nothing`() {
        val world = World()
        val app = wireApp(offlineEnv(world = world, authority = RunAuthority()))
        val before = app.state.triage

        // setPriority is Reversible, so the GATE passes it through: this is the ARM
        // reading its own state before deciding, which is where F9's rule 1 lives.
        app.human(SET_PRIORITY, "ticket" to "9999", "level" to "High")

        assertTrue(
            app.performed.none { it.effect is TriageEffect.LogDecision },
            "measured OLD: Effect.Log performed for a mutation that never happened",
        )
        assertEquals(before, app.state.triage, "no mutation")

        val notice = assertIs<Notice.Rejected>(app.state.spine.notices.single())
        assertEquals("unknown ticket 9999", notice.reason)
        assertEquals(SET_PRIORITY, notice.tool)

        assertEquals(RunStatus.Idle, app.state.spine.run)
        assertEquals("ok", app.controller.view.root.banner)
    }

    @Test
    fun `F9 - a rejection does not poison the session - the NEXT good action still works`() {
        val world = World()
        val app = wireApp(offlineEnv(world = world, authority = RunAuthority()))

        // Four different failures in a row, including the unresolvable-name path
        // that hijacked the banner in the shipped port.
        app.human(ToolName("noSuchTool"))
        app.human(SET_PRIORITY, "ticket" to "9999", "level" to "High")
        app.human(CONFIRM_ESCALATION, "ticket" to "4118")
        app.agent(SET_PRIORITY, "ticket" to "4118", "level" to "Nope") // fails to decode

        assertEquals(4, app.state.spine.notices.size, "four per-item markers")
        assertEquals(RunStatus.Idle, app.state.spine.run)
        assertEquals("ok", app.controller.view.root.banner, "measured OLD: degraded for the rest of the session")

        // The session is still healthy: the next good action folds normally.
        app.human(SET_PRIORITY, "ticket" to "4118", "level" to "High")

        assertEquals(Priority.High, app.state.triage.priority.getValue(known))
        assertEquals(1, app.performed.count { it.effect is TriageEffect.LogDecision })
        assertEquals("ok", app.controller.view.root.banner)
    }
}
