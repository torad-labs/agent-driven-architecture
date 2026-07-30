// ── test/spine/boundary — commit before perform, and `now` on the record ──
// the review's measured (G9) failure: RecordingBus after a step folded at now=9 exposed keys
// ['commands','results'] and contained no 'now'; a live boundary that folded at
// at:1001 re-folded at at:0.

package adr.spine

import adr.Driver
import adr.app.Assembly
import adr.app.Env
import adr.app.RunAuthority
import adr.app.Wiring
import adr.app.World
import adr.blocks.triage.Priority
import adr.blocks.triage.SET_PRIORITY
import adr.contract.TriageEffect
import adr.spine.boundary.MovingClock
import adr.spine.pure.Timestamp
import adr.spine.replay.Replay
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BoundaryTest {

    @Test
    fun `the committed record carries now, so a live boundary can be re-folded (G9)`() {
        val app = Wiring().wireApp(Env(clock = MovingClock(start = 1000, step = 7)))
        Driver().human(app, SET_PRIORITY, "ticket" to "4118", "level" to "High")

        // The record IS the step: the 14.7 envelope plus the fields the step is,
        // one of them the clock read.
        val record = app.bus.records().first()
        assertEquals(Timestamp(1007), record.now)
        assertEquals(record.now, (app.performed.single().effect as TriageEffect.LogDecision).at)
    }

    @Test
    fun `G9 - a live turn under a MOVING clock re-folds to IDENTICAL timestamps`() {
        // The measured failure, in one line: a live boundary that folded at at:1001
        // re-folded at at:0. `append(signedCommands, capturedResults)` had no clock
        // read in it, and a RecordingBus after a step folded at now=9 exposed keys
        // ['commands','results'] and nothing else — so the timestamp was not lost in
        // the re-fold, it was never written down.
        //
        // A MOVING clock is what makes this test able to fail. Under a fixed clock a
        // re-fold that invented Timestamp(0) would still differ, but a re-fold that
        // re-READ the clock would pass by luck; here every step has a distinct
        // timestamp that exists nowhere except on its own committed record.
        val authority = RunAuthority()
        val app = Wiring().wireApp(
            Env(
                world = World(),
                authority = authority,
                clock = MovingClock(start = 1000, step = 7),
            ),
        )
        Driver().driveCanonicalSession(app, authority)

        val liveEffects = app.performed.toList()
        val liveStamps = liveEffects.map { it.effect.at }

        assertTrue(liveStamps.isNotEmpty())
        assertTrue(liveStamps.none { it == Timestamp(0) }, "the live run stamped real times")
        assertEquals(liveStamps.distinct().size > 1, true, "the clock really moved across the run")

        // Re-fold from NOTHING BUT the committed bytes: no clock is available here.
        // The fold is the replay host's constructor state; the timeline is the argument.
        val (_, effects2) = Replay(Assembly()::fold).refold(app.initial, app.bus.records())

        assertEquals(liveStamps, effects2.map { it.effect.at }, "measured OLD: live at:1001 -> re-folded at:0")
        assertEquals(liveEffects, effects2, "…and the keys round-trip with them")

        // `now` is ON the record — the field whose absence caused all of the above.
        assertEquals(Timestamp(1007), app.bus.records().first().now)
        assertEquals(
            app.bus.records().map { it.now }.distinct(),
            app.bus.records().map { it.now },
            "each committed step carries its own clock read",
        )
    }

    @Test
    fun `the effect key is derived from the COMMITTED step index (G9)`() {
        val app = Wiring().wireApp(Env())
        Driver().human(app, SET_PRIORITY, "ticket" to "4118", "level" to "High")
        Driver().human(app, SET_PRIORITY, "ticket" to "4118", "level" to "Urgent")

        // step 0 effect 0, then step 1 effect 0 — the key cannot exist before the append
        // returned the index it is built from, so commit strictly precedes perform.
        assertEquals(listOf(0 to 0, 1 to 0), app.performed.map { it.key.step.value to it.key.index })
    }

    @Test
    fun `the fold reads its own state for supersedes - the tool returned raw inputs only`() {
        val app = Wiring().wireApp(Env())
        Driver().human(app, SET_PRIORITY, "ticket" to "4118", "level" to "High")
        Driver().human(app, SET_PRIORITY, "ticket" to "4118", "level" to "Urgent")

        val logs = app.performed.map { it.effect }.filterIsInstance<TriageEffect.LogDecision>()
        assertEquals(listOf(null, Priority.High), logs.map { it.supersedes })
    }

    @Test
    fun `actions and results are BOTH recorded, and differ whenever the gate spoke`() {
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = World(), authority = authority))
        Driver().human(app, adr.blocks.escalation.REQUEST_ESCALATION, "ticket" to "4118")
        Driver().human(app, adr.blocks.escalation.CONFIRM_ESCALATION, "ticket" to "4118")

        val record = app.bus.records().last()
        assertEquals(adr.blocks.escalation.CONFIRM_ESCALATION, record.actions.single().tool)
        assertTrue(record.results.single() is adr.contract.ToolResult.Refused)
    }
}
