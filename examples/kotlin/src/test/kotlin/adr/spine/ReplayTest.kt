// ── test/spine/replay — F5: a LIVE run against its REPLAY ─────────────────
// The shipped harness asserted f(x) == f(x): it folded one in-memory array twice
// through a pure function. Measured: seam 07's own named violation (a tool reading a
// mutable global and performing a side effect) PASSED it, because foldAll never
// invoked a tool at all.
//
// This asserts something that can actually fail: the state and the FULL effect
// sequence — keys and every timestamp — produced by a live boundary against the same
// two things re-derived from nothing but the committed bytes.

package adr.spine

import adr.app.RunAuthority
import adr.app.World
import adr.app.foldApp
import adr.app.offlineEnv
import adr.app.projectContextApp
import adr.app.wireApp
import adr.driveCanonicalSession
import adr.spine.boundary.RecordingSink
import adr.spine.boundary.movingClock
import adr.spine.replay.assertReplayFaithful
import adr.spine.replay.collectPerform
import adr.spine.replay.refold
import adr.spine.pure.PerformMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ReplayTest {

    @Test
    fun `F5 - the live run and its re-fold agree on state and on every effect`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(
            offlineEnv(
                world = world,
                authority = authority,
                clock = movingClock(start = 1000, step = 7),
            ),
        )

        app.driveCanonicalSession(authority)

        val liveState = app.state
        val liveEffects = app.performed.toList()

        val (state2, effects2) = refold(app.initial, app.bus.records(), ::foldApp)

        assertEquals(liveState, state2, "state re-derives from the committed bytes")
        assertEquals(liveEffects, effects2, "so does the full effect sequence — keys AND timestamps")
        assertTrue(liveEffects.isNotEmpty())

        // And the digest check: a change to projectContext that silently alters what the
        // model saw fails the golden trace, WITHOUT re-running the model (F4/§5.3).
        assertReplayFaithful(
            initial = app.initial,
            records = app.bus.records(),
            liveState = liveState,
            liveEffects = liveEffects,
            fold = ::foldApp,
            projectContext = ::projectContextApp,
            promptVersion = "triage-prompt@1",
        )
    }

    @Test
    fun `PerformMode REPLAY collects the descriptors and fires NOTHING`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = world, authority = authority))
        app.driveCanonicalSession(authority)

        val liveEffects = app.performed.toList()
        val pagesAfterLive = world.pages.size
        val deliveriesAfterLive = world.deliveries.size
        assertEquals(1, pagesAfterLive)
        assertEquals(1, deliveriesAfterLive)

        // Drive the SAME sink chain the live run used — including the real adapters.
        val replaySink = RecordingSink(adr.app.AppSink(world.oncall, world.delivery, world.relay, mutableListOf()))
        collectPerform(app.initial, app.bus.records(), replaySink, PerformMode.REPLAY, ::foldApp)

        assertEquals(liveEffects, replaySink.performed, "descriptors collected…")
        assertEquals(pagesAfterLive, world.pages.size, "…and nothing fired")
        assertEquals(deliveriesAfterLive, world.deliveries.size)
    }

    @Test
    fun `a divergent re-fold is DETECTED - the harness is not vacuous`() {
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = World(), authority = authority))
        app.driveCanonicalSession(authority)

        // Drop one committed step: the re-fold must no longer match the live run.
        val truncated = app.bus.records().dropLast(1)
        val (state2, _) = refold(app.initial, truncated, ::foldApp)
        assertTrue(state2 != app.state, "a harness that cannot fail is not a harness")
    }
}
