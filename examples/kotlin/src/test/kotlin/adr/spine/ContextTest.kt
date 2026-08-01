// ── test/spine/context — G15: the third projection, and its bound ─────────
// The reasoner's input used to be the one seam with no type, no projection, no
// bound, no capture rule and no test layer. This file is the test layer.

package adr.spine

import adr.Driver
import adr.app.App
import adr.app.Assembly
import adr.app.Env
import adr.app.State
import adr.app.Wiring
import adr.app.World
import adr.blocks.analysis.AnalysisBlock
import adr.blocks.analysis.AnalysisNote
import adr.blocks.analysis.AnalysisSlice
import adr.blocks.console.ConsoleBlock
import adr.blocks.console.ConsoleSlice
import adr.blocks.escalation.EscalationBlock
import adr.blocks.inbox.InboxBlock
import adr.blocks.inbox.InboxSlice
import adr.blocks.triage.SET_PRIORITY
import adr.blocks.triage.Ticket
import adr.blocks.triage.TriageBlock
import adr.spine.boundary.FinishedStep
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.ContextBounds
import adr.spine.pure.ContextFixture
import adr.spine.pure.ContextRenderer
import adr.spine.pure.DEFAULT_CONTEXT_BOUNDS
import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK
import adr.spine.pure.MAX_CONTEXT_NOTICES
import adr.spine.pure.Notice
import adr.spine.pure.PanelId
import adr.spine.pure.RawInput
import adr.spine.pure.Recall
import adr.spine.pure.SourceKey
import adr.spine.pure.SourceName
import adr.spine.pure.SpineSlice
import adr.spine.pure.StagedInput
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName
import adr.spine.replay.ReplayFaithfulness
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** The blocks that contribute context lines: triage, escalation, console, analysis, inbox. */
private const val CONTEXT_LINE_BLOCKS = 5

/** A window narrower than the shipped one, so a re-derivation under it CANNOT agree. */
private val NARROW = ContextBounds(linesPerBlock = 2, notices = 2)

/** Six tickets, so a window of 2 and the shipped window of 8 render different digests.
 *  With one ticket every bound above 1 agrees and the cross-window walk below would
 *  pass vacuously — the trap C7 already fell into once on this tree. */
private val SIX_TICKETS = (0..5).map { Ticket(TicketId("T$it"), "body $it") }

/** Six panels, all VISIBLE: `ConsoleProjection` counts `panels.filterValues { it }`, and
 *  `ConsoleBlock().slice(...)` seeds every panel HIDDEN — which is why the console's
 *  window was unobservable until this fixture existed. */
private val PANELS = (0..5).map { PanelId("p$it") }

/** Five tickets for the golden trace below: at five, a window of 8 clamps nothing and a
 *  window of 4 clamps two blocks, so the frozen digest is sensitive to the shipped
 *  lines-per-block default without being sensitive to anything else. */
private val FIVE_TICKETS = (0..4).map { Ticket(TicketId("T$it"), "body $it") }

/**
 * THE COMMITTED SIDE OF THE DIGEST WALK, FROZEN AS TEXT (docs/DECISIONS.md:174).
 *
 * Literal, and that is the entire point: a golden built by calling [ContextRenderer]
 * would witness itself, which is exactly the cancellation that let a halved default
 * leave both gates green. Regenerating these strings is a deliberate edit — any change
 * to what the model reads, a moved default included, lands here as a diff.
 */
private val GOLDEN = listOf(
    listOf(
        "staged: 0 input(s)",
        "- ticket T0 [Normal] body 0",
        "- ticket T1 [Normal] body 1",
        "- ticket T2 [Normal] body 2",
        "- ticket T3 [Normal] body 3",
        "- ticket T4 [Normal] body 4",
        "- ticket T0 is open",
        "- ticket T1 is open",
        "- ticket T2 is open",
        "- ticket T3 is open",
        "- ticket T4 is open",
        "artifact: 0 line(s)",
    ).joinToString("\n"),
    listOf(
        "staged: 0 input(s)",
        "- ticket T0 [Normal] body 0",
        "- ticket T1 [Normal] body 1",
        "- ticket T2 [Normal] body 2",
        "- ticket T3 [Normal] body 3",
        "- ticket T4 [Normal] body 4",
        "- ticket T0 is open",
        "- ticket T1 is open",
        "- ticket T2 is open",
        "- ticket T3 is open",
        "- ticket T4 is open",
        "! nope0: no registered verb",
        "! nope1: no registered verb",
        "! nope2: no registered verb",
        "! nope3: no registered verb",
        "artifact: 0 line(s)",
    ).joinToString("\n"),
)

class ContextTest {

    @Test
    fun `projectContext is a pure function of committed state plus this turn's staged input`() {
        val state = Assembly().initialState(listOf(Ticket(TicketId("4118"), "refund not received")))
        val staged = listOf(
            StagedInput.Perceived(SourceName("inbox"), "customer says the refund never arrived", SourceKey("inbox-1")),
        )

        val context = Assembly().context(state, staged)

        assertEquals(staged, context.staged)
        assertEquals(0, context.artifactLineCount)
        assertTrue(context.lines.any { it.contains("ticket 4118") })
        // Calling it again on the same state gives the same value — it is a projection,
        // not an accumulator. Nothing was appended anywhere.
        assertEquals(context, Assembly().context(state, staged))
    }

    @Test
    fun `G15 - the context is BOUNDED, so it does not grow with session length`() {
        val tickets = (1..500).map { Ticket(TicketId("T$it"), "body $it") }
        val noisy = Assembly().initialState(tickets).let { s ->
            s.copy(
                spine = SpineSlice(
                    run = s.spine.run,
                    notices = (1..200).map { Notice.Rejected(Timestamp(it.toLong()), ToolName("t$it"), "r$it") },
                ),
            )
        }

        val context = Assembly().context(noisy, emptyList())

        assertEquals(MAX_CONTEXT_LINES_PER_BLOCK, TriageBlock().contextLines(noisy.triage).size)
        assertEquals(MAX_CONTEXT_NOTICES, context.notices.size)
        assertTrue(context.lines.size <= CONTEXT_LINE_BLOCKS * MAX_CONTEXT_LINES_PER_BLOCK)
        // The artifact contributes a COUNT, never content — a long session cannot inflate it.
        assertEquals(0, context.artifactLineCount)
        assertTrue(
            ContextRenderer().render(context).lines().size <=
                CONTEXT_LINE_BLOCKS * MAX_CONTEXT_LINES_PER_BLOCK + MAX_CONTEXT_NOTICES + 2,
        )
    }

    @Test
    fun `the rendered digest and the prompt version ride the committed record (14_7)`() {
        val app = Wiring().wireApp(Env())
        Driver().human(app, SET_PRIORITY, "ticket" to "4118", "level" to "High")

        val fixture = app.bus.records().single().context
        assertEquals("triage-prompt@1", fixture.promptVersion)
        // The digest is the state as it was BEFORE the step — the input the model saw.
        assertEquals(ContextRenderer().render(Assembly().context(app.initial, emptyList())), fixture.digest)
    }

    // ── The window is WIRED, not welded (docs/DECISIONS.md:174) ───────────────
    // Four halves, and each exists because the one before it is not enough alone.
    //
    // Before this suite the tree could not tell a bound change from no change at all:
    // MAX_CONTEXT_LINES_PER_BLOCK 8 -> 4 and MAX_CONTEXT_NOTICES 8 -> 3 left both
    // gates green, because every assertion about the bound was written in terms of
    // the constant it was asserting and the digest walk re-derived under the same
    // constant it had committed with. Measured in both directions: green at 4,
    // green at 40.
    //
    // WHY PER SITE AND NOT ONE LINE COUNT. An aggregate cannot say WHICH read
    // honoured the window. Measured on the first cut of this file, three of the five
    // injected block reads could be replaced by the shipped constant with the whole
    // Kotlin suite still green, because `Assembly().initialState` seeds only triage
    // and escalation and `ConsoleProjection` counts VISIBLE panels — of which a
    // seeded slice has none. [crowded] gives every site something to clamp.

    @Test
    fun `the shipped default window is pinned - moving a default is a red diff`() {
        // The LITERALS, not the constants: `assertEquals(MAX_CONTEXT_NOTICES, ...)`
        // witnesses itself and moves with the edit it exists to catch.
        assertEquals(ContextBounds(linesPerBlock = 8, notices = 8), DEFAULT_CONTEXT_BOUNDS)
        assertEquals(8, MAX_CONTEXT_LINES_PER_BLOCK)
        assertEquals(8, MAX_CONTEXT_NOTICES)
    }

    @Test
    fun `every block's window is observable ON ITS OWN, not through one total`() {
        val s = crowded()
        // The default counts are MEASURED against this fixture, not guessed; each is
        // above NARROW.linesPerBlock, which is the whole reason the fixture exists.
        assertEquals(6, TriageBlock().contextLines(s.triage).size)
        assertEquals(2, TriageBlock().contextLines(s.triage, 2).size)

        assertEquals(6, EscalationBlock().contextLines(s.escalation).size)
        assertEquals(2, EscalationBlock().contextLines(s.escalation, 2).size)

        assertEquals(7, ConsoleBlock().contextLines(s.console).size)
        assertEquals(2, ConsoleBlock().contextLines(s.console, 2).size)

        assertEquals(3, AnalysisBlock().contextLines(s.analysis).size)
        assertEquals(2, AnalysisBlock().contextLines(s.analysis, 2).size)

        assertEquals(4, InboxBlock().contextLines(s.inbox).size)
        assertEquals(2, InboxBlock().contextLines(s.inbox, 2).size)
    }

    @Test
    fun `the root's window reaches EVERY line site - at zero the projection is empty`() {
        // A window of ZERO empties the projection, so no line site in `Assembly.context`
        // can quietly reach for the constant instead of the argument it was handed —
        // including one whose natural size is too small to clamp at any usable window.
        assertTrue(Assembly().context(crowded(), emptyList(), ContextBounds(linesPerBlock = 0)).lines.isEmpty())
    }

    @Test
    fun `the notices field is its OWN window, isolated from linesPerBlock`() {
        val s = crowded()
        assertEquals(8, Assembly().context(s, emptyList()).notices.size)
        // linesPerBlock held EQUAL to the committed value, so only the notices field
        // varies and the assertion cannot be satisfied by the lines moving instead.
        assertEquals(2, Assembly().context(s, emptyList(), ContextBounds(linesPerBlock = 8, notices = 2)).notices.size)
        // and the converse: moving linesPerBlock alone leaves the notices at 8.
        assertEquals(8, Assembly().context(s, emptyList(), ContextBounds(linesPerBlock = 2, notices = 8)).notices.size)
    }

    @Test
    fun `the aggregate is the SUM of the sites, and the root moves all of them`() {
        val s = crowded()
        // 26 = triage 6 + escalation 6 + console 7 + analysis 3 + inbox 4
        assertEquals(26, Assembly().context(s, emptyList()).lines.size)
        // 10 = 2 + 2 + 2 + 2 + 2 — all five sites clamp, which is what the per-site
        // table above proves one at a time rather than by arithmetic.
        assertEquals(10, Assembly().context(s, emptyList(), NARROW).lines.size)
    }

    @Test
    fun `a root that says NOTHING inherits the shipped window, explicitly`() {
        assertEquals(DEFAULT_CONTEXT_BOUNDS, Wiring().wireApp(Env()).boundary.contextBounds)
        // …and the OTHER root seam: the offline Env constructor carries the window
        // through too, which its own defaulted parameter would otherwise swallow.
        assertEquals(NARROW, Env(world = World(), contextBounds = NARROW).contextBounds)
    }

    @Test
    fun `the boundary commits under the window it was wired with, not the default`() {
        val app = Wiring().wireApp(Env(tickets = SIX_TICKETS, contextBounds = NARROW))
        Driver().human(app, SET_PRIORITY, "ticket" to "T0", "level" to "High")

        val digest = app.bus.records().single().context.digest
        assertEquals(NARROW, app.boundary.contextBounds)
        assertEquals(ContextRenderer().render(Assembly().context(app.initial, emptyList(), NARROW)), digest)
        assertNotEquals(ContextRenderer().render(Assembly().context(app.initial, emptyList())), digest)
    }

    @Test
    fun `the TOOLS are handed the WIRED window, not the shipped default`() {
        // THE OTHER SIDE OF THE SAME VALUE, and it needs its own instrument. What the
        // seam COMMITS and what the tools READ are two calls; a boundary that committed
        // under the wired window and answered `context()` from the shipped one left
        // every assertion above green. Measured: replacing `contextBounds` with
        // `DEFAULT_CONTEXT_BOUNDS` in that accessor moved nothing at all.
        val app = Wiring().wireApp(Env(tickets = SIX_TICKETS, contextBounds = NARROW))

        assertEquals(Assembly().context(app.state, emptyList(), NARROW), app.boundary.context())
        assertNotEquals(Assembly().context(app.state, emptyList()), app.boundary.context())
    }

    @Test
    fun `a timeline re-derived under a DIFFERENT window diverges at the digest`() {
        val app = Wiring().wireApp(Env(tickets = SIX_TICKETS))
        Driver().human(app, SET_PRIORITY, "ticket" to "T0", "level" to "High")
        Driver().human(app, SET_PRIORITY, "ticket" to "T1", "level" to "High")

        assertEquals(DEFAULT_CONTEXT_BOUNDS, app.boundary.contextBounds)
        assertEquals(2, app.bus.records().size)

        // THE ALLOW HALF. Re-derived under the window the boundary was WIRED with,
        // the golden trace is silent — without it the denial below would be a walk
        // that always throws.
        faithfulness(app, app.boundary.contextBounds).assertFaithful(
            initial = app.initial,
            records = app.bus.records(),
            liveState = app.state,
            liveEffects = app.performed.toList(),
        )

        // THE DENY HALF. The same committed bytes, a narrower window, and the
        // committed fixture catches it. This is the property §6.11 now states.
        val thrown = assertFailsWith<IllegalStateException> {
            faithfulness(app, NARROW).assertFaithful(
                initial = app.initial,
                records = app.bus.records(),
                liveState = app.state,
                liveEffects = app.performed.toList(),
            )
        }
        assertTrue(
            thrown.message.orEmpty().contains("context fixture committed at step 0"),
            "the digest walk names the step: ${thrown.message}",
        )
    }

    // ── THE GOLDEN TRACE: a committed side that is a FILE ──────────────────────
    // §6.11 says the committed digest catches a change to the bound. Everything above
    // proves the bound THREADS; none of it proves that sentence, because the stamping
    // side and the re-deriving side are both code and a moved default moves them
    // together. Measured on the tree that shipped the two literal pins: halve both
    // defaults, silence the pins, and the whole digest walk stays green in both ports.
    //
    // So the committed side is FROZEN in [GOLDEN], as text. [ReplayFaithfulness] is
    // still the only digest checker here — it is simply handed a committed side it
    // cannot re-derive, which is the one thing it never had.

    @Test
    fun `the digest walk catches a moved default, because the committed side is a file`() {
        val app = Wiring().wireApp(Env(tickets = FIVE_TICKETS))
        // Four unregistered verbs in ONE step: the spine's own arm folds four notices,
        // so the SECOND digest is sensitive to the notices default as well as to the
        // lines-per-block one. A golden that only exercised one of the two would call
        // half of probe P caught when it is not.
        app.boundary.agent(
            FinishedStep(
                staged = emptyList(),
                actions = (0..3).map { Action(ToolName("nope$it"), RawInput()) },
            ),
        )
        Driver().human(app, SET_PRIORITY, "ticket" to "T0", "level" to "High")

        // The RECORDS are live — `sig` is a sealed [Signature] the spine alone may mint
        // (docs/DECISIONS.md:44), so a synthetic StepRecord is neither available nor
        // wanted. Only the committed context fixture is substituted.
        val records = app.bus.records()
        assertEquals(GOLDEN.size, records.size)
        assertNotEquals(GOLDEN[0], GOLDEN[1], "a golden whose steps are interchangeable checks one step")

        val golden = records.mapIndexed { i, record ->
            record.copy(context = ContextFixture("triage-prompt@1", GOLDEN[i]))
        }

        faithfulness(app, DEFAULT_CONTEXT_BOUNDS).assertFaithful(
            initial = app.initial,
            records = golden,
            liveState = app.state,
            liveEffects = app.performed.toList(),
        )
    }

    /** Every block that contributes context lines contributes MORE than
     *  `NARROW.linesPerBlock`, and the spine holds more notices than `NARROW.notices` —
     *  the cheapest way to make a site observable is to give it something to clamp. */
    private fun crowded(): State = State(
        spine = SpineSlice(
            notices = (0..9).map { Notice.Rejected(Timestamp(it.toLong()), ToolName("setPriority"), "reason $it") },
        ),
        triage = TriageBlock().slice(SIX_TICKETS),
        escalation = EscalationBlock().slice(SIX_TICKETS.map { it.id }),
        console = ConsoleSlice(focused = TicketId("T0"), panels = PANELS.associateWith { true }),
        analysis = AnalysisSlice(
            notes = listOf(
                AnalysisNote(Timestamp(1000), Recall.Fresh("conclusion 0", Timestamp(900))),
                AnalysisNote(Timestamp(1001), Recall.LastKnown("conclusion 1", Timestamp(900))),
                AnalysisNote(Timestamp(1002), Recall.Fresh("conclusion 2", Timestamp(900))),
            ),
        ),
        inbox = InboxSlice(
            conflated = mapOf(SourceName("s0") to 2, SourceName("s1") to 3),
            duplicates = mapOf(SourceName("s2") to 1),
            faults = listOf("backend timeout"),
        ),
    )

    /** The harness the root's OWN admission and dispatchers are handed to; only the
     *  window varies between the calls above, so the walk is the same walk. */
    private fun faithfulness(app: App, bounds: ContextBounds): ReplayFaithfulness<State> =
        ReplayFaithfulness(
            fold = Assembly()::fold,
            projectContext = Assembly()::context,
            promptVersion = "triage-prompt@1",
            admission = app.admission,
            bounds = bounds,
        )
}
