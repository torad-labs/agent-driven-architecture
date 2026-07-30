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
import adr.app.App
import adr.app.Assembly
import adr.app.Env
import adr.app.RunAuthority
import adr.app.State
import adr.app.Wiring
import adr.app.World
import adr.blocks.escalation.TicketStatus
import adr.contract.EscalationEffect
import adr.spine.boundary.MovingClock
import adr.spine.boundary.RecordingSink
import adr.spine.pure.Authority
import adr.spine.pure.PerformMode
import adr.spine.pure.TicketId
import adr.spine.replay.Recovery
import adr.spine.replay.RecordMark
import adr.spine.replay.Replay
import adr.spine.replay.ReplayFaithfulness
import adr.spine.replay.Resume
import adr.spine.replay.Snapshot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

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
    fun `SCRUB - at k=4 the escalation is REQUESTED, refused once, and not yet granted`() {
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = World(), authority = authority))
        Driver().driveCanonicalSession(app, authority)

        val records = app.bus.records()
        assertEquals(8, records.size)

        // k=4 is the one interior step that discriminates. The request went in at step 3,
        // the SAME-principal confirm at step 4 was refused at the gate, and the policy tier
        // that grants it acts at step 5 — so this is the moment the scrub story is about:
        // what the system believed BEFORE the grant, re-derived from the prefix alone.
        val scrubbed = Replay(Assembly()::fold).stateAtStep(app.initial, records, 4)

        assertEquals(
            TicketStatus.Escalating(TicketId("4118"), Authority("host:marcos")),
            scrubbed.state.escalation.statusOf(TicketId("4118")),
            "the ask is outstanding, and WHO asked is what the gate compares against",
        )
        // two decisions logged and the refusal's diagnostic — and nobody paged. The FULL
        // effect prefix, because a scrub that hid the effects would hide the page.
        assertEquals(3, scrubbed.effects.size)
        assertEquals(
            app.performed.toList().take(3),
            scrubbed.effects,
            "the FULL keyed prefix — keys AND payloads — against what the LIVE sink performed",
        )
        assertTrue(
            scrubbed.effects.none { it.effect is EscalationEffect.PageOncall },
            "the on-call page is one step away and has not fired",
        )

        // the playhead dragged off the front end: CLAMPED, not thrown. A bare
        // `take(-1)` raises IllegalArgumentException on a caller's arithmetic.
        assertEquals(
            app.initial,
            Replay(Assembly()::fold).stateAtStep(app.initial, records, -1).state,
            "a playhead before the first step is the initial state, not a fault",
        )

        // and dragged to the RIGHT end, and past it. Positive named facts at the
        // upper boundary, never an equality against the whole re-fold.
        val whole = Replay(Assembly()::fold).stateAtStep(app.initial, records, records.size)
        assertEquals(5, whole.effects.size, "the last step's effect is IN the scrub, not one short")
        assertTrue(
            whole.effects.any { it.effect is EscalationEffect.PageOncall },
            "by the end the on-call page HAS fired",
        )
        val past = Replay(Assembly()::fold).stateAtStep(app.initial, records, records.size + 5)
        assertEquals(5, past.effects.size, "a playhead past the last step is the whole timeline")
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

    // ── 14.1 — a memoized fold prefix whose TAG refuses ───────────────────────
    //
    // 14.1's equation is `fold(snapshot@k, timeline[k..]) == fold(initialState,
    // timeline)`, and asserting exactly that would be worth nothing: one pure function
    // over one in-memory list, called twice, true by construction — the same
    // f(x) == f(x) this file exists to end. So the right-hand side of every acceptance
    // assertion below is what the LIVE run produced, never a second re-fold.
    //
    // The REFUSAL cases mutate ONLY the tag — state and memoized effects stay identical
    // to the honest snapshot, the move RelayTest already makes on its golden trace —
    // and they resume at the tag's OWN offset, because that is the only resume site a
    // STORED snapshot permits: nothing else in the system knows which prefix a snapshot
    // covers. A guard that only refuses when the caller volunteers an independent
    // number is a guard that never fires in production.

    /**
     * STRICTLY INTERIOR, and a literal rather than something derived from the record
     * count. At 0 the resume degenerates into the full re-fold already asserted above;
     * at 8 the tail is empty and the snapshot IS the answer. Either one passes without
     * the seam having done anything.
     */
    private val interiorK = 3

    private fun drivenApp(): Pair<App, Env> {
        val authority = RunAuthority()
        val env = Env(
            world = World(),
            authority = authority,
            clock = MovingClock(start = 1000, step = 7),
        )
        val app = Wiring().wireApp(env)
        Driver().driveCanonicalSession(app, authority)
        return app to env
    }

    /** THE resume site — the tail is requested AT THE TAG'S OWN OFFSET, because a
     *  reader holding a stored snapshot has no other source for it. */
    private fun resumeAt(app: App, snapshot: Snapshot<State>): Resume<State> =
        Replay(Assembly()::fold).refoldFrom(
            snapshot,
            Recovery().tailFrom(app.bus.records(), snapshot.tag.offset),
            app.reducerVersion,
        )

    @Test
    fun `14 1 - a snapshot-seeded resume equals what the LIVE run produced`() {
        val (app, env) = drivenApp()
        val records = app.bus.records()
        assertEquals(8, records.size, "the canonical session commits eight steps")
        assertEquals("triage-fold@1", app.reducerVersion)
        assertEquals(env.reducerVersion, app.reducerVersion, "the root's value, not a copy")

        val replay = Replay(Assembly()::fold)
        val snapshot = replay.snapshotAt(app.initial, records, interiorK, app.reducerVersion)
        assertEquals(app.reducerVersion, snapshot.tag.reducerVersion)
        assertEquals(interiorK, snapshot.tag.offset)
        // the tag names the record it stops at, read off the prefix it folded
        assertEquals(
            RecordMark(records[interiorK - 1].now, records[interiorK - 1].context.digest, records[interiorK - 1].results),
            snapshot.tag.coveredThrough,
        )

        // INTERIOR, proven at BOTH ends rather than asserted in a comment: the prefix
        // folded something (k > 0, or this is the whole-timeline re-fold already
        // covered) and the tail still has something left (k < n, or the snapshot IS the
        // answer and the seam did nothing).
        assertTrue(snapshot.tag.offset > 0, "k must be interior at the low end")
        assertTrue(snapshot.tag.offset < records.size, "k must be interior at the high end")
        // …and the memo is genuinely not the answer yet.
        assertNotEquals(app.state, snapshot.state)
        assertTrue(snapshot.effects.size < app.performed.size)

        when (val resumed = resumeAt(app, snapshot)) {
            // the LIVE anchors, never a second call to refold
            is Resume.Resumed<State> -> {
                assertEquals(app.state, resumed.outcome.state, "the live state, from a snapshot")
                assertEquals(app.performed, resumed.outcome.effects, "and the FULL sequence")
            }

            is Resume.Refused -> fail("an honest snapshot must resume: ${resumed.cause}")
        }
    }

    @Test
    fun `14 1 - the record mark DISCRIMINATES every committed step`() {
        // If two records ever shared a mark, the extent guard below would silently stop
        // distinguishing their offsets and every refusal case would go vacuous while
        // staying green. So the precondition is pinned, not assumed.
        val records = drivenApp().first.bus.records()
        val marks = records.map { RecordMark(it.now, it.context.digest, it.results) }
        assertEquals(records.size, marks.toSet().size, "every step must be discriminable")
    }

    @Test
    fun `14 1 - BOTH halves of the mark carry weight, and the precondition has an edge`() {
        // A two-component mark invites a component nobody checks. Measured on a draft of
        // this file: comparing only `now` left the whole suite green. So each half is
        // put in a configuration where it is the only thing doing the work.
        //
        // THE DEFAULT RIG. The clock moves and the mark separates all eight steps — but
        // only SEVEN distinct digests exist, because two steps of the canonical session
        // render an identical context. The timestamp half is what separates that pair,
        // which is exactly why `now` is in the mark and not decoration.
        assertEquals(listOf(8, 8, 7, 8), census(7), "n, byNow, byDigest, byMark")

        // FREEZE THE CLOCK. `now` is a value the boundary READS (G9) — not a counter,
        // and nothing promises it moves; a coarse clock stamps several steps inside one
        // tick. The timestamp half collapses to one value and the committed context
        // digest (G15) carries what is left, which is what makes `digest` load-bearing.
        //
        // AND THE EDGE IS NOW CLOSED, not papered over: under the frozen clock (now, digest)
        // alone separated only 7 of 8 — review corrupted an offset across exactly that
        // colliding pair and the resume folded a wrong tail with every mark agreeing. The
        // mark's third half, the committed results, separates every record this reference
        // commits: byMark is 8 of 8 under BOTH clocks, and the corrupted-offset case below
        // proves the refusal rather than assuming the discrimination.
        assertEquals(listOf(8, 1, 7, 8), census(0), "n, byNow, byDigest, byMark")
    }

    @Test
    fun `14 1 - a corrupted offset must refuse even where two records share (now, digest)`() {
        // The exploit review ran: records 6 and 7 of the frozen-clock session share
        // timestamp AND rendered context, so a tag whose offset drifted between them
        // once resumed with every (now, digest) mark agreeing. The results half of the
        // mark is what refuses it now.
        val authority = RunAuthority()
        val env = Env(
            world = World(),
            authority = authority,
            clock = MovingClock(start = 1000, step = 0),
        )
        val app = Wiring().wireApp(env)
        Driver().driveCanonicalSession(app, authority)
        val records = app.bus.records()

        val replay = Replay(Assembly()::fold)
        val honest = replay.snapshotAt(app.initial, records, records.size, app.reducerVersion)
        val corrupt = honest.copy(tag = honest.tag.copy(offset = records.size - 1))

        val verdict = replay.refoldFrom(
            corrupt,
            Recovery().tailFrom(records, corrupt.tag.offset),
            app.reducerVersion,
        )
        assertTrue(verdict is Resume.Refused, "a drifted offset must refuse, not fold a wrong tail")
    }

    /** n, distinct-by-now, distinct-by-digest, distinct-by-mark for one clock step. */
    private fun census(step: Long): List<Int> {
        val authority = RunAuthority()
        val env = Env(
            world = World(),
            authority = authority,
            clock = MovingClock(start = 1000, step = step),
        )
        val app = Wiring().wireApp(env)
        Driver().driveCanonicalSession(app, authority)
        val r = app.bus.records()
        return listOf(
            r.size,
            r.map { it.now }.toSet().size,
            r.map { it.context.digest }.toSet().size,
            r.map { RecordMark(it.now, it.context.digest, it.results) }.toSet().size,
        )
    }

    @Test
    fun `14 1 - every corrupted offset is REFUSED at the only resume site there is`() {
        val (app, _) = drivenApp()
        val records = app.bus.records()
        val replay = Replay(Assembly()::fold)
        val honest = replay.snapshotAt(app.initial, records, interiorK, app.reducerVersion)

        // the control: the honest snapshot resumes, and to the LIVE answer
        when (val ok = resumeAt(app, honest)) {
            is Resume.Resumed<State> -> {
                assertEquals(app.state, ok.outcome.state)
                assertEquals(app.performed, ok.outcome.effects)
            }

            is Resume.Refused -> fail("the control must resume: ${ok.cause}")
        }

        // Every other offset the tag could carry — 0 and n included, the two degenerate
        // ends. State and effects are identical to `honest`; ONLY the number moved.
        // Each must REFUSE, never fold a wrong tail into a plausible answer, so what is
        // asserted is the VERDICT and never the outcome.
        listOf(0, 1, 2, 4, 5, 6, 7, 8).forEach { drift ->
            val corrupt = honest.copy(tag = honest.tag.copy(offset = drift))
            assertTrue(
                resumeAt(app, corrupt) is Resume.Refused,
                "offset $drift must be refused, never folded into a plausible answer",
            )
        }
    }

    @Test
    fun `14 1 - a snapshot under the WRONG reducer version is REFUSED`() {
        val (app, _) = drivenApp()
        val records = app.bus.records()
        val replay = Replay(Assembly()::fold)
        val snapshot = replay.snapshotAt(app.initial, records, interiorK, app.reducerVersion)
        val tail = Recovery().tailFrom(records, interiorK)

        // SAME state, SAME effects, SAME extent — only the version differs, which is
        // exactly the mutation 14.1 says makes a snapshot untrustworthy (14.7).
        val stale = snapshot.copy(tag = snapshot.tag.copy(reducerVersion = "triage-fold@2"))
        when (val verdict = replay.refoldFrom(stale, tail, app.reducerVersion)) {
            is Resume.Refused -> assertTrue(verdict.cause.contains("triage-fold@2"), verdict.cause)
            is Resume.Resumed<State> -> fail("a stale reducer version must be refused")
        }

        // …and the unmutated snapshot still resumes, so the refusal is about the TAG
        // and not about the seam being broken for everything.
        assertTrue(replay.refoldFrom(snapshot, tail, app.reducerVersion) is Resume.Resumed<State>)
    }

    @Test
    fun `14 1 - a misfiled offset against a tail somebody ELSE selected is REFUSED`() {
        val (app, _) = drivenApp()
        val records = app.bus.records()
        val replay = Replay(Assembly()::fold)
        val snapshot = replay.snapshotAt(app.initial, records, interiorK, app.reducerVersion)
        val tail = Recovery().tailFrom(records, interiorK)

        // The case the NUMERIC half owns and the content mark cannot see: the tail is
        // the honest one, so `follows` still agrees; only the literal moved.
        listOf(interiorK - 1, interiorK + 1).forEach { drift ->
            val misfiled = snapshot.copy(tag = snapshot.tag.copy(offset = drift))
            assertEquals(snapshot.tag.coveredThrough, misfiled.tag.coveredThrough)
            assertTrue(
                replay.refoldFrom(misfiled, tail, app.reducerVersion) is Resume.Refused,
                "offset $drift must be refused",
            )
        }

        // The log is the other party: ask it for a tail at a different offset and the
        // honest snapshot refuses that too.
        val elsewhere = Recovery().tailFrom(records, interiorK + 1)
        assertTrue(replay.refoldFrom(snapshot, elsewhere, app.reducerVersion) is Resume.Refused)
        assertTrue(replay.refoldFrom(snapshot, tail, app.reducerVersion) is Resume.Resumed<State>)
    }

    @Test
    fun `14 1 - the tag records what was FOLDED, never what was asked for`() {
        val (app, _) = drivenApp()
        val records = app.bus.records()
        val replay = Replay(Assembly()::fold)

        val over = replay.snapshotAt(app.initial, records, records.size + 2, app.reducerVersion)
        assertEquals(records.size, over.tag.offset)
        assertEquals(
            RecordMark(records.last().now, records.last().context.digest, records.last().results),
            over.tag.coveredThrough,
        )

        // …and it stays honest downstream against a log that later grows past it: a tag
        // that had recorded `at` would now point into records it never folded.
        val grown = records + records.take(2)
        val overreach = Recovery().tailFrom(grown, records.size + 2)
        assertTrue(replay.refoldFrom(over, overreach, app.reducerVersion) is Resume.Refused)
        // the honest extent over the SAME grown log still resumes
        val honestTail = Recovery().tailFrom(grown, records.size)
        assertTrue(
            replay.refoldFrom(over, honestTail, app.reducerVersion) is Resume.Resumed<State>,
        )
    }

    @Test
    fun `14 1 - a negative extent folds nothing and a tail beginning nowhere carries nothing`() {
        val (app, _) = drivenApp()
        val records = app.bus.records()
        val replay = Replay(Assembly()::fold)

        val under = replay.snapshotAt(app.initial, records, -1, app.reducerVersion)
        assertEquals(0, under.tag.offset)
        assertNull(under.tag.coveredThrough)
        assertEquals(emptyList(), under.effects)

        // A tail asked for at an origin the log does not have is served as NOTHING
        // rather than clamped into a plausible slice.
        val back = Recovery().tailFrom(records, -1)
        assertEquals(emptyList(), back.records)
        assertNull(back.follows)
        assertEquals(emptyList(), Recovery().tailFrom(records, records.size + 1).records)

        val honest = replay.snapshotAt(app.initial, records, interiorK, app.reducerVersion)
        assertTrue(replay.refoldFrom(honest, back, app.reducerVersion) is Resume.Refused)

        // THE DEGENERATE PAIR the content mark alone cannot separate: an empty prefix
        // has no mark, and neither does a tail beginning nowhere, so both marks are
        // null and AGREE. Only refusing a negative origin outright keeps this from
        // resuming to the initial state and calling it the whole session.
        val corrupt = under.copy(tag = under.tag.copy(offset = -1))
        assertTrue(resumeAt(app, corrupt) is Resume.Refused, "a negative origin must refuse")

        // …while the same snapshot, uncorrupted, resumes to the LIVE answer.
        when (val ok = resumeAt(app, under)) {
            is Resume.Resumed<State> -> assertEquals(app.performed, ok.outcome.effects)
            is Resume.Refused -> fail("an honest empty-prefix snapshot must resume: ${ok.cause}")
        }
    }
}
