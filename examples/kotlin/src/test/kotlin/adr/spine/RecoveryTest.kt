// ── test/spine/recovery — G9: the idempotency key, actually constructed ───
// 14.6 rested the whole recovery-path safety claim on "the effect's id is its
// idempotency key", and no port ever built one. MEASURED: the same confirm applied
// twice → PageOncall fired TWICE, both at:9.
//
// Here the key comes from (committed step index, effect index within the step), so it
// is stable across a crash, a restart and any number of retries.

package adr.spine

import adr.Driver
import adr.app.Assembly
import adr.app.Env
import adr.app.RunAuthority
import adr.app.Wiring
import adr.app.World
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.contract.ArtifactEffect
import adr.contract.EscalationEffect
import adr.contract.ToolResult
import adr.spine.boundary.DedupingSink
import adr.spine.pure.PerformMode
import adr.spine.replay.Replay
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class RecoveryTest {

    @Test
    fun `G9 - RECOVERY re-driven twice fires each irreversible effect exactly once`() {
        val world = World()
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = world, authority = authority))
        Driver().driveCanonicalSession(app, authority)

        val sink = DedupingSink()
        // ONE replay host, driven twice: the fold it holds is the same both times, so
        // what differs between the two drives is nothing at all — which is the point.
        val replay = Replay(Assembly()::fold, app.admission)
        replay.collectPerform(app.initial, app.bus.records(), sink, PerformMode.RECOVERY)
        replay.collectPerform(app.initial, app.bus.records(), sink, PerformMode.RECOVERY)

        assertEquals(1, sink.fired.count { it is EscalationEffect.PageOncall })
        assertEquals(1, sink.fired.count { it is ArtifactEffect.DeliverArtifact })
    }

    @Test
    fun `the other half - a SECOND confirm is refused, because no request survives the first`() {
        val world = World()
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = world, authority = authority))

        Driver().human(app, REQUEST_ESCALATION, "ticket" to "4118")
        Driver().under(app, authority, "policy-tier-v3") { Driver().human(app, CONFIRM_ESCALATION, "ticket" to "4118") }
        assertEquals(1, world.pages.size)

        Driver().under(app, authority, "policy-tier-v3") { Driver().human(app, CONFIRM_ESCALATION, "ticket" to "4118") }
        assertIs<ToolResult.Refused>(app.bus.records().last().results.last())
        assertEquals(1, world.pages.size, "the irreversible action stays done exactly once")
    }
}
