// ── test/app/demo-smoke — the shipped demo actually runs, offline ─────────

package adr.app

import adr.driveCanonicalSession
import adr.human
import adr.spine.pure.RunStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DemoSmokeTest {

    @Test
    fun `the demo runs end to end with no keys and no network`() {
        main()
    }

    @Test
    fun `F9 - after every kind of rejection the SESSION banner is still ok`() {
        val world = World()
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = world, authority = authority))

        app.driveCanonicalSession(authority)
        app.human(adr.spine.pure.ToolName("noSuchTool"))
        app.human(adr.blocks.triage.SET_PRIORITY, "ticket" to "9999", "level" to "High")

        assertEquals(RunStatus.Idle, app.state.spine.run, "per-item failures never reach RunStatus")
        assertEquals("ok", app.controller.view.root.banner)
        assertTrue(app.state.spine.notices.isNotEmpty(), "…they leave per-item notices instead")
    }
}
