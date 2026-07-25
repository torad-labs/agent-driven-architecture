// ── test/spine/recovery — F7: the idempotency key, actually constructed ───
// 14.6 rested the whole recovery-path safety claim on "the effect's id is its
// idempotency key", and no port ever built one. MEASURED: the same confirm applied
// twice → PageOncall fired TWICE, both at:9.
//
// Here the key comes from (committed step index, effect index within the step), so it
// is stable across a crash, a restart and any number of retries.

package adr.spine

import adr.app.RunAuthority
import adr.app.World
import adr.app.foldApp
import adr.app.offlineEnv
import adr.app.wireApp
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.contract.ArtifactEffect
import adr.contract.EscalationEffect
import adr.contract.ToolResult
import adr.driveCanonicalSession
import adr.human
import adr.spine.boundary.DedupingSink
import adr.spine.pure.PerformMode
import adr.spine.replay.collectPerform
import adr.under
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class RecoveryTest {

    @Test
    fun `F7 - RECOVERY re-driven twice fires each irreversible effect exactly once`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = world, authority = authority))
        app.driveCanonicalSession(authority)

        val sink = DedupingSink()
        collectPerform(app.initial, app.bus.records(), sink, PerformMode.RECOVERY, ::foldApp)
        collectPerform(app.initial, app.bus.records(), sink, PerformMode.RECOVERY, ::foldApp)

        assertEquals(1, sink.fired.count { it is EscalationEffect.PageOncall })
        assertEquals(1, sink.fired.count { it is ArtifactEffect.DeliverArtifact })
    }

    @Test
    fun `the other half - a SECOND confirm is refused, because no request survives the first`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = world, authority = authority))

        app.human(REQUEST_ESCALATION, "ticket" to "4118")
        app.under(authority, "policy-tier-v3") { human(CONFIRM_ESCALATION, "ticket" to "4118") }
        assertEquals(1, world.pages.size)

        app.under(authority, "policy-tier-v3") { human(CONFIRM_ESCALATION, "ticket" to "4118") }
        assertIs<ToolResult.Refused>(app.bus.records().last().results.last())
        assertEquals(1, world.pages.size, "the irreversible action stays done exactly once")
    }
}
