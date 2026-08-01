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
import adr.blocks.triage.PRE_V2_REASON
import adr.contract.TriageResult.Priority
import adr.blocks.triage.SET_PRIORITY
import adr.blocks.triage.TriageUpcast
import adr.contract.ToolResult
import adr.contract.TriageEffect
import adr.contract.TriageResult
import adr.contract.TriageV1Result
import adr.spine.boundary.MovingClock
import adr.spine.boundary.RecordingSink
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.ContextFixture
import adr.spine.pure.CURRENT_SCHEMA
import adr.spine.pure.GENESIS_SCHEMA
import adr.spine.pure.PerformMode
import adr.spine.pure.RawInput
import adr.spine.pure.SchemaUpcast
import adr.spine.pure.SchemaVersion
import adr.spine.pure.Signature
import adr.spine.pure.StepRecord
import adr.spine.pure.StepRecordV1
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.replay.Replay
import adr.spine.replay.ReplayFaithfulness
import kotlin.reflect.full.primaryConstructor
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
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

        val (state2, effects2) = Replay(Assembly()::fold, app.admission).refold(app.initial, app.bus.records())

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
            admission = app.admission,
            bounds = app.boundary.contextBounds,
        ).assertFaithful(
            initial = app.initial,
            records = app.bus.records(),
            liveState = liveState,
            liveEffects = liveEffects,
        )
    }

    // ── THE SCRUB CURSOR, PROVEN BY EXERCISE ─────────────────────────────
    // docs/DECISIONS.md:117-118 ratifies the cursor "proving the scrub story BY
    // EXERCISE", and stateAtStep's own KDoc promises exactly what is below. A
    // review found the promise false in both ports and the tool called by
    // nothing at all: a mutation making it ignore `k` and fold the WHOLE
    // timeline left `./gradlew check --rerun-tasks` fully green. A scrub bar
    // wired to that would show the end state at every position on the drag.
    @Test
    fun `the scrub cursor re-folds ONLY the prefix, at an interior k`() {
        val app = Wiring().wireApp(
            Env(world = World(), authority = RunAuthority(), clock = MovingClock(start = 1000, step = 7)),
        )
        Driver().driveCanonicalSession(app, RunAuthority())
        val replay = Replay(Assembly()::fold, app.admission)
        val records = app.bus.records()
        val whole = replay.refold(app.initial, records)

        for (k in 1 until records.size) {
            val cut = replay.stateAtStep(app.initial, records, k)
            assertTrue(
                cut.state != whole.state,
                "k=$k is already the end state — the cursor ignored its bound",
            )
            assertEquals(
                replay.refold(app.initial, records.take(k)).state,
                cut.state,
                "k=$k must equal the re-fold of exactly that many records",
            )
        }
    }

    @Test
    fun `the scrub cursor CLAMPS BY SLICING, never by throwing`() {
        val app = Wiring().wireApp(
            Env(world = World(), authority = RunAuthority(), clock = MovingClock(start = 1000, step = 7)),
        )
        Driver().driveCanonicalSession(app, RunAuthority())
        val replay = Replay(Assembly()::fold, app.admission)
        val records = app.bus.records()
        val whole = replay.refold(app.initial, records)

        assertEquals(app.initial, replay.stateAtStep(app.initial, records, 0).state)
        assertEquals(app.initial, replay.stateAtStep(app.initial, records, -5).state)
        assertEquals(emptyList(), replay.stateAtStep(app.initial, records, 0).effects)
        assertEquals(whole.state, replay.stateAtStep(app.initial, records, records.size).state)
        assertEquals(whole.state, replay.stateAtStep(app.initial, records, records.size + 99).state)
        assertEquals(whole.effects, replay.stateAtStep(app.initial, records, records.size).effects)
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

        // Drive the SAME sink chain the live run used — including the real adapters,
        // and the same ASSEMBLED dispatcher, so what replay is stubbing is the shipped
        // performer set rather than a second sink that happens to resemble it.
        val replayLog = mutableListOf<String>()
        val replaySink = RecordingSink(
            adr.app.AppSink(
                adr.app.Wiring().effectPerformers(
                    Env(world = world, authority = authority),
                    replayLog,
                ),
                adr.app.DiagPerformer(replayLog),
            ),
        )
        Replay(Assembly()::fold, app.admission)
            .collectPerform(app.initial, app.bus.records(), replaySink, PerformMode.REPLAY)

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
        val (state2, _) = Replay(Assembly()::fold, app.admission).refold(app.initial, truncated)
        assertTrue(state2 != app.state, "a harness that cannot fail is not a harness")
    }

    // ── 14.7 — SCHEMA EVOLUTION, over a log written before the field existed ──
    //
    // Two things are proven, and only the pair is worth anything:
    //
    //   1. THE OLD LOG CANNOT REPLAY AT ALL, in BOTH halves. The ENVELOPE half:
    //      `schemaVersion` has no default, so no construction site can forget it,
    //      and the two versions are different VALUES rather than the same constant
    //      read twice. The PAYLOAD half: a v1 payload is not a ToolResult, so it
    //      cannot enter `StepRecord.results` whatever the envelope says.
    //   2. THE UPCAST IS OBSERVABLE. Re-folding the LIFTED log produces a
    //      different effect sequence from re-folding a native v2 one, in a field
    //      the fold actually consumes. An upcaster whose output nothing reads is a
    //      function that can be deleted with every test still green.
    //
    // WHY THESE ARE REFLECTION AND VALUE ASSERTIONS rather than compile fixtures:
    // this port's must-fail-compile harness is wired to `check`, not `test`, so a
    // compile fixture would not run under the gate that adjudicates this change.
    // Every assertion below is therefore chosen for being able to INVERT — an
    // assertion on a final class's supertype, for instance, is a constant `false`
    // and has no place in a proof set.
    //
    // The v1 log is an in-code typed fixture, not a file: this reference persists
    // nothing (the bus is a list of typed records) and 14.1 leaves the canonical
    // encoding product-owned. So the "old shape" is a TYPE the compiler refuses,
    // which is a stronger fixture than bytes a hand-written parser must agree with.

    private fun v1Log(): List<StepRecordV1<TriageV1Result.SetPriority>> = listOf(
        StepRecordV1(
            schemaVersion = GENESIS_SCHEMA,
            now = Timestamp(1000),
            sig = Signature(Actor.Agent, Authority("agent-run-7f")),
            staged = emptyList(),
            actions = listOf(Action(SET_PRIORITY, RawInput("ticket" to "4118", "level" to "High"))),
            results = listOf(
                TriageV1Result.SetPriority(SET_PRIORITY, TicketId("4118"), Priority.High),
            ),
            commands = emptyList(),
            context = ContextFixture("triage-prompt@1", ""),
        ),
    )

    @Test
    fun `14_7 - this port writes v2, genesis was 1, and they are different numbers`() {
        // Without this, every other version assertion compares the committed value
        // against the constant that produced it — both sides move together under a
        // mutation and the number is unpinned. These are the two hard values.
        assertEquals(SchemaVersion(2), CURRENT_SCHEMA, "this port writes v2")
        assertEquals(SchemaVersion(1), GENESIS_SCHEMA, "genesis is 1; there is no v0")
        assertNotEquals(CURRENT_SCHEMA, GENESIS_SCHEMA)
    }

    @Test
    fun `14_7 - the envelope is REQUIRED on BOTH records, and the v1 payload is not a ToolResult`() {
        val params = checkNotNull(StepRecord::class.primaryConstructor).parameters
        assertEquals(8, params.size, "the record is the envelope plus the fields the step is")
        assertFalse(
            params.single { it.name == "schemaVersion" }.isOptional,
            "a defaulted schemaVersion would let a construction site forget the envelope",
        )

        // The v1 record is STAMPED too, and just as non-optionally. A fixture that
        // could omit the version would stop standing in for a record that carried one,
        // and "genesis is 1" would be true of a comment rather than of the code.
        val v1Params = checkNotNull(StepRecordV1::class.primaryConstructor).parameters
        assertEquals(8, v1Params.size, "the v1 record carries its own version")
        assertFalse(
            v1Params.single { it.name == "schemaVersion" }.isOptional,
            "the v1 envelope is stamped, not implied",
        )

        // THE PAYLOAD HALF, asserted where it can actually invert: `ToolResult` is a
        // SEALED class, so this flips the moment someone makes the v1 payload extend
        // it — which is exactly the mistake that would let a v2 envelope be spread
        // over v1 payloads and re-folded.
        assertFalse(
            ToolResult::class.java.isAssignableFrom(TriageV1Result.SetPriority::class.java),
            "a v1 payload must NOT be a ToolResult, or refold would accept an un-upcast log",
        )
    }

    @Test
    fun `14_7 - the UPCAST log re-folds, and the upcaster's decision rides the effect`() {
        val app = Wiring().wireApp(Env(world = World(), authority = RunAuthority()))
        val lifted = SchemaUpcast(TriageUpcast()::v1).let { upcast -> v1Log().map(upcast::v1) }

        assertEquals(listOf(SchemaVersion(2)), lifted.map { it.schemaVersion })

        val (state, effects) = Replay(Assembly()::fold, app.admission).refold(app.initial, lifted)
        assertEquals(
            listOf(
                TriageEffect.LogDecision(
                    at = Timestamp(1000),
                    ticket = TicketId("4118"),
                    level = Priority.High,
                    // the Kotlin app seeds tickets without a priority, so the first
                    // transition supersedes nothing — the fold reading its OWN state
                    supersedes = null,
                    reason = PRE_V2_REASON,
                ),
            ),
            effects.map { it.effect },
        )
        assertEquals(Priority.High, state.triage.priority[TicketId("4118")])
    }

    @Test
    fun `14_7 - the field is OBSERVABLE - a NATIVE v2 record re-folds to a different effect`() {
        // The control, and it is built from a real v2 record rather than by lifting the
        // v1 fixture through a substitute upcaster: a "native" record assembled out of
        // history is not a control at all. If `reason` never reached the fold, this and
        // the assertion above would be the same value and the upcaster untestable.
        val app = Wiring().wireApp(Env(world = World(), authority = RunAuthority()))
        val native = listOf(
            StepRecord(
                schemaVersion = CURRENT_SCHEMA,
                now = Timestamp(1000),
                sig = Signature(Actor.Agent, Authority("agent-run-7f")),
                staged = emptyList(),
                actions = listOf(
                    Action(SET_PRIORITY, RawInput("ticket" to "4118", "level" to "High")),
                ),
                results = listOf(
                    TriageResult.SetPriority(
                        SET_PRIORITY,
                        TicketId("4118"),
                        Priority.High,
                        "customer escalated",
                    ),
                ),
                commands = emptyList(),
                context = ContextFixture("triage-prompt@1", ""),
            ),
        )

        val (_, effects) = Replay(Assembly()::fold, app.admission).refold(app.initial, native)
        assertEquals(
            listOf("customer escalated"),
            effects.map { (it.effect as TriageEffect.LogDecision).reason },
        )
    }

    @Test
    fun `14_7 - a LIVE step commits the envelope, at the one site that mints a record`() {
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = World(), authority = authority))
        Driver().driveCanonicalSession(app, authority)

        assertTrue(app.bus.records().isNotEmpty())
        assertEquals(
            listOf(SchemaVersion(2)),
            app.bus.records().map { it.schemaVersion }.distinct(),
        )
    }
}
