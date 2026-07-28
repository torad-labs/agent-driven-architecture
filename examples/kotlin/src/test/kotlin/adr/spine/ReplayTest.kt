// ── test/spine/replay — G9: a LIVE run against its REPLAY ─────────────────
// The shipped harness asserted f(x) == f(x): it folded one in-memory array twice
// through a pure function. Measured: seam 07's own named violation (a tool reading a
// mutable global and performing a side effect) PASSED it, because foldAll never
// invoked a tool at all.
//
// This asserts something that can actually fail: the state and the FULL effect
// sequence — keys and every timestamp — produced by a live boundary against the same
// two things re-derived from nothing but the committed bytes.

package adr.spine

import adr.Driver
import adr.app.Assembly
import adr.app.Env
import adr.app.RunAuthority
import adr.app.Wiring
import adr.app.World
import adr.spine.boundary.MovingClock
import adr.spine.boundary.RecordingSink
import adr.spine.pure.PerformMode
import adr.spine.replay.Replay
import adr.spine.replay.ReplayFaithfulness
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ReplayTest {

    @Test
    fun `G9 - the live run and its re-fold agree on state and on every effect`() {
        val world = World()
        val authority = RunAuthority()
        val app = Wiring().wireApp(
            Env(
                world = world,
                authority = authority,
                clock = MovingClock(start = 1000, step = 7),
            ),
        )

        Driver().driveCanonicalSession(app, authority)

        val liveState = app.state
        val liveEffects = app.performed.toList()

        val (state2, effects2) = Replay(Assembly()::fold).refold(app.initial, app.bus.records())

        assertEquals(liveState, state2, "state re-derives from the committed bytes")
        assertEquals(liveEffects, effects2, "so does the full effect sequence — keys AND timestamps")
        assertTrue(liveEffects.isNotEmpty())

        // And the digest check: a change to projectContext that silently alters what the
        // model saw fails the golden trace, WITHOUT re-running the model (G15/§5.3). The
        // three app-constant values are what the harness is BUILT with; the timeline and
        // the live run it is measured against are what it is CALLED with.
        ReplayFaithfulness(
            fold = Assembly()::fold,
            projectContext = Assembly()::context,
            promptVersion = "triage-prompt@1",
        ).assertFaithful(
            initial = app.initial,
            records = app.bus.records(),
            liveState = liveState,
            liveEffects = liveEffects,
        )
    }

    @Test
    fun `PerformMode REPLAY collects the descriptors and fires NOTHING`() {
        val world = World()
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = world, authority = authority))
        Driver().driveCanonicalSession(app, authority)

        val liveEffects = app.performed.toList()
        val pagesAfterLive = world.pages.size
        val deliveriesAfterLive = world.deliveries.size
        assertEquals(1, pagesAfterLive)
        assertEquals(1, deliveriesAfterLive)

        // Drive the SAME sink chain the live run used — including the real adapters.
        val replaySink = RecordingSink(adr.app.AppSink(world.oncall, world.delivery, world.relay, mutableListOf()))
        Replay(Assembly()::fold).collectPerform(app.initial, app.bus.records(), replaySink, PerformMode.REPLAY)

        assertEquals(liveEffects, replaySink.performed, "descriptors collected…")
        assertEquals(pagesAfterLive, world.pages.size, "…and nothing fired")
        assertEquals(deliveriesAfterLive, world.deliveries.size)
    }

    @Test
    fun `a divergent re-fold is DETECTED - the harness is not vacuous`() {
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = World(), authority = authority))
        Driver().driveCanonicalSession(app, authority)

        // Drop one committed step: the re-fold must no longer match the live run.
        val truncated = app.bus.records().dropLast(1)
        val (state2, _) = Replay(Assembly()::fold).refold(app.initial, truncated)
        assertTrue(state2 != app.state, "a harness that cannot fail is not a harness")
    }
}
