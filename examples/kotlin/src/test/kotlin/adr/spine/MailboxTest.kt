// ── test/spine/mailbox — the barge-in rung, PROVEN (12) ───────────────────
//
// F11 (measured, on the shipped prose): 12.3's drain loop puts
// `outcome = await(inFlight)` at LOOP-BODY indentation while `mailbox.take()` blocks
// at the top. Control never reaches take() during a turn, `turnInFlight` is false at
// every take(), all three guards are dead, and Fig 12.1's mid-turn "take Interrupt"
// is unproducible.
//
// THE FIRST TEST IN THIS FILE IS THE WHOLE CLAIM, and it is written so it cannot
// pass against that loop: it MEASURES, on a virtual clock, the moment the interrupt's
// turn started, and compares it against a CONTROL RUN of the identical turn with no
// interrupt. The control settles at t=10000. The interrupt starts at t=150. A loop
// that could only handle the interrupt after the turn finished would produce 10000,
// and the assertion names that number.
//
// EVERY TEST HERE RUNS ON VIRTUAL TIME (`runTest` + `advanceTimeBy`). There is not
// one wall-clock sleep in this file: a test that sleeps is a flaky test, and a
// timing claim proven by a flaky test is not proven.

package adr.spine

import adr.app.State
import adr.app.World
import adr.app.Env
import adr.app.Wiring
import adr.blocks.artifact.RECORD_FINDING
import adr.blocks.artifact.SealStatus
import adr.blocks.inbox.DropReason
import adr.blocks.triage.Priority
import adr.blocks.triage.SET_PRIORITY
import adr.contract.ArtifactCommand
import adr.contract.InboxCommand
import adr.contract.TriageEffect
import adr.spine.boundary.FinishedStep
import adr.spine.concurrency.InMemoryMailbox
import adr.spine.concurrency.TurnRunner
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.BlockRegistration
import adr.spine.pure.CANCEL_DEADLINE_MS
import adr.spine.pure.InputPolicy
import adr.spine.pure.Message
import adr.spine.pure.SourceKey
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName
import adr.spine.pure.TurnOutcome
import adr.spine.pure.RawInput
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private val TICKETS = SourceName("tickets")
private val SENSOR = SourceName("sensor")
private val OPERATOR = SourceName("operator")

/** Turn A's second step lands here. The interrupt must be handled long before it. */
private const val LONG_TURN_MS = 10_000L
private const val FIRST_STEP_MS = 100L

/** How long a turn that IGNORES cancellation stays alive. Far past CANCEL_DEADLINE_MS. */
private const val STUBBORN_TURN_MS = 5_000L

private fun inputOf(source: SourceName, key: String, body: String) =
    Message.Input(source, StagedInput.Perceived(source, body), SourceKey(key))

private fun stepOf(
    tool: ToolName,
    vararg fields: Pair<String, String>,
    staged: List<StagedInput> = emptyList(),
) = FinishedStep(Actor.Agent, staged, listOf(Action(tool, RawInput(*fields))))

/**
 * One wired tier with a mailbox. Everything is built through the composition root
 * (`wireApp` + `wireConsumer`) — a test that reached around I1 would be testing
 * something the application does not do.
 */
private class Barge(
    val world: World = World(),
    val mailbox: InMemoryMailbox = InMemoryMailbox(),
    policies: List<InputPolicy> = emptyList(),
    verbs: List<BlockRegistration<State>>? = null,
    runner: TurnRunner,
) {
    private val env = Env(
        world = world,
        mailbox = mailbox,
        policies = policies,
        verbs = verbs,
    )
    val app = Wiring().wireApp(env)
    val consumer = checkNotNull(Wiring().wireConsumer(app, env, runner))

    /** Every tool name committed to the timeline, in order. */
    fun committed(): List<String> = app.bus.records().flatMap { it.commands }.map { it.tool.value }
}

class MailboxTest {

    // ── 1 · THE CLAIM ─────────────────────────────────────────────────────
    @Test
    fun `PREEMPTION - the Interrupt is handled BEFORE the long turn would have completed`() = runTest {
        val startedAt = mutableMapOf<String, Long>()

        fun longTurnRunner() = TurnRunner { message, ctx ->
            startedAt[message.source.value] = currentTime
            when (message) {
                is Message.Input -> {
                    delay(FIRST_STEP_MS)
                    // STEP 1 — committed, and it must SURVIVE the cancel (12.3).
                    ctx.submit(stepOf(SET_PRIORITY, "ticket" to "4118", "level" to "High", staged = ctx.staged))
                    delay(LONG_TURN_MS - FIRST_STEP_MS)
                    // STEP 2 — this is what the interrupt must not have to wait for.
                    ctx.submit(stepOf(SET_PRIORITY, "ticket" to "4118", "level" to "Urgent", staged = ctx.staged))
                }

                is Message.Interrupt ->
                    ctx.submit(stepOf(RECORD_FINDING, "text" to "interrupt handled", staged = ctx.staged))

                is Message.Drain -> Unit
            }
        }

        // CONTROL — the SAME turn, no interrupt. This is what "would have completed"
        // MEANS: measured on the clock, not assumed from the source.
        val controlBase = currentTime
        val control = Barge(runner = longTurnRunner())
        val controlJob = launch { control.consumer.run() }
        control.mailbox.post(inputOf(TICKETS, "k1", "reading A"))
        advanceUntilIdle()
        val controlElapsed = currentTime - controlBase
        assertEquals(LONG_TURN_MS, controlElapsed, "the uninterrupted turn takes $LONG_TURN_MS")
        assertContentEquals(listOf("setPriority", "setPriority"), control.committed())
        controlJob.cancelAndJoin()

        // THE MEASUREMENT. Virtual time carries across both runs inside one runTest,
        // so everything below is an ELAPSED time relative to this base.
        startedAt.clear()
        val base = currentTime
        val h = Barge(runner = longTurnRunner())
        val job = launch { h.consumer.run() }
        h.mailbox.post(inputOf(TICKETS, "k1", "reading A"))
        advanceTimeBy(150)
        assertEquals(0L, startedAt.getValue(TICKETS.value) - base, "turn A started immediately")

        h.mailbox.post(Message.Interrupt(OPERATOR, "stop and answer me"))
        advanceUntilIdle()

        val interruptStartedAt = startedAt.getValue(OPERATOR.value) - base
        assertTrue(
            interruptStartedAt < controlElapsed,
            "PREEMPTION FAILED: the interrupt's turn started ${interruptStartedAt}ms in, and the " +
                "same turn uninterrupted takes ${controlElapsed}ms. The book's 12.3 drain loop " +
                "cannot start it before ${controlElapsed}ms, because `outcome = await(inFlight)` " +
                "runs before control ever returns to take(). A number >= $controlElapsed here " +
                "means the consumer IS the broken loop.",
        )
        assertEquals(150L, interruptStartedAt, "it started the moment the Interrupt was posted")

        // NO INTERLEAVE (12.3): A's step 1, then the interrupt's step, and NO A record
        // after the interrupt's first record. A's step 2 never reached the boundary.
        assertContentEquals(listOf("setPriority", "recordFinding"), h.committed())

        // CANCELLATION IS AT A STEP BOUNDARY: the step that completed before the cancel
        // stays DURABLY FOLDED and its effect stays performed. There is no rollback and
        // no compensating write.
        assertEquals(Priority.High, h.app.state.triage.priority.getValue(TicketId("4118")))
        assertTrue(h.app.performed.any { it.effect is TriageEffect.LogDecision })
        assertEquals(1, h.app.bus.records().count { r -> r.commands.any { it.tool == SET_PRIORITY } })

        assertEquals(listOf(TurnOutcome.Cancelled(OPERATOR), TurnOutcome.Ok(1)), h.consumer.settled)
        job.cancelAndJoin()
    }

    // ── 2 · the bound is real, and revocation holds the guarantee when it blows ──
    @Test
    fun `the cancel deadline is BOUNDED - an uncancellable turn is revoked, counted and abandoned`() = runTest {
        val h = Barge(
            runner = TurnRunner { message, ctx ->
                when (message) {
                    is Message.Input -> {
                        ctx.submit(stepOf(RECORD_FINDING, "text" to "folded before the cancel"))
                        // The case 12.3 hand-waves: a turn that does not cooperate.
                        withContext(NonCancellable) { delay(STUBBORN_TURN_MS) }
                        // …and then submits ANYWAY, long past the deadline.
                        ctx.submit(stepOf(RECORD_FINDING, "text" to "LATE - must be dropped"))
                    }

                    is Message.Interrupt ->
                        ctx.submit(stepOf(RECORD_FINDING, "text" to "interrupt handled"))

                    is Message.Drain -> Unit
                }
            },
        )
        val job = launch { h.consumer.run() }
        h.mailbox.post(inputOf(TICKETS, "k1", "reading"))
        advanceTimeBy(10)
        h.mailbox.post(Message.Interrupt(OPERATOR, "stop"))

        // Past CANCEL_DEADLINE_MS, but long before the stubborn turn wakes.
        advanceTimeBy(CANCEL_DEADLINE_MS + 60)
        val committedBeforeTheLateSubmit = h.app.bus.records().size

        // The consumer did NOT wait for the turn: the interrupt was served.
        assertTrue(h.committed().contains("recordFinding"))
        assertTrue(
            h.app.bus.records().any { r ->
                r.commands.any { it is InboxCommand.NoteFault && it.fault.startsWith("abandoned") }
            },
            "the blown deadline is FOLDED as a signed Command — named, degraded and counted",
        )

        // Now let the abandoned turn wake up and submit.
        advanceUntilIdle()
        assertTrue(currentTime >= STUBBORN_TURN_MS, "the abandoned turn did wake up")
        assertEquals(
            committedBeforeTheLateSubmit,
            h.app.bus.records().size,
            "REVOCATION: the abandoned turn's submit folded NOTHING. Two folds cannot " +
                "interleave EVEN WHEN THE JOIN FAILS.",
        )
        assertFalse(
            h.app.controller.view.artifact.lines.contains("LATE - must be dropped"),
            "the late line never reached State either",
        )

        // It never settled, so it is absent from the settled log — that IS the leak,
        // and it is named rather than hidden.
        assertEquals(listOf(TurnOutcome.Ok(1)), h.consumer.settled)
        job.cancelAndJoin()
    }

    // ── 3 · perishable: newest-input-wins, and the drop is never silent ─────
    @Test
    fun `PERISHABLE - three inputs while busy conflate to the newest and FOLD a counted drop`() = runTest {
        val handled = mutableListOf<String>()
        val h = Barge(
            policies = listOf(InputPolicy.Perishable(SENSOR)),
            runner = TurnRunner { message, ctx ->
                (message as? Message.Input)?.let { handled += it.staged.body }
                ctx.submit(stepOf(RECORD_FINDING, "text" to Wiring().promptFor(message), staged = ctx.staged))
                delay(1_000)
            },
        )
        val job = launch { h.consumer.run() }

        h.mailbox.post(inputOf(SENSOR, "a", "reading A"))
        advanceTimeBy(10)
        h.mailbox.post(inputOf(SENSOR, "b", "reading B"))
        h.mailbox.post(inputOf(SENSOR, "c", "reading C"))
        h.mailbox.post(inputOf(SENSOR, "d", "reading D"))
        advanceUntilIdle()

        assertContentEquals(
            listOf("reading A", "reading D"),
            handled,
            "one turn ran for the conflated batch, and it ran the NEWEST input",
        )
        val drop = h.app.bus.records()
            .flatMap { it.commands }
            .filterIsInstance<InboxCommand.NoteDrop>()
            .single()
        assertEquals(2, drop.dropped)
        assertEquals(DropReason.Conflated, drop.reason)
        assertEquals(SENSOR, drop.source)
        assertEquals(mapOf(SENSOR to 2), h.app.state.inbox.conflated)

        // …AND THE MODEL IS TOLD. The conflation is folded BEFORE the next turn starts,
        // so it is in the context digest that turn's step was reasoned against.
        val conflatedTurnStep = h.app.bus.records().last { r ->
            r.commands.any { it is ArtifactCommand.RecordFinding && it.text == "reading D" }
        }
        assertTrue(
            conflatedTurnStep.context.digest.contains("2 input(s) conflated from sensor"),
            "the reasoner must be told it is shedding load: ${conflatedTurnStep.context.digest}",
        )
        job.cancelAndJoin()
    }

    // ── 4 · durable: the opposite policy, on the same machinery ─────────────
    @Test
    fun `DURABLE - the same three inputs run three turns, in order, with zero drops`() = runTest {
        val handled = mutableListOf<String>()
        val h = Barge(
            // No policy listed for this source: the DEFAULT is DurableQueue (12.2).
            runner = TurnRunner { message, ctx ->
                (message as? Message.Input)?.let { handled += it.staged.body }
                ctx.submit(stepOf(RECORD_FINDING, "text" to Wiring().promptFor(message), staged = ctx.staged))
                delay(1_000)
            },
        )
        val job = launch { h.consumer.run() }

        h.mailbox.post(inputOf(TICKETS, "a", "ticket A"))
        advanceTimeBy(10)
        h.mailbox.post(inputOf(TICKETS, "b", "ticket B"))
        h.mailbox.post(inputOf(TICKETS, "c", "ticket C"))
        h.mailbox.post(inputOf(TICKETS, "d", "ticket D"))
        advanceUntilIdle()

        assertContentEquals(listOf("ticket A", "ticket B", "ticket C", "ticket D"), handled)
        assertEquals(emptyMap(), h.app.state.inbox.conflated, "a durable queue NEVER conflates")
        assertTrue(h.mailbox.unacked().isEmpty(), "and every one of them was acked")
        job.cancelAndJoin()
    }

    // ── 5 · dedupe, and the ordering that makes redelivery safe ─────────────
    @Test
    fun `DURABLE - ack happens only AFTER the commit, and a redelivered key is deduped`() = runTest {
        val mailbox = InMemoryMailbox()
        val unackedAtCommitTime = mutableListOf<Int>()
        val h = Barge(
            mailbox = mailbox,
            runner = TurnRunner { message, ctx ->
                ctx.submit(stepOf(RECORD_FINDING, "text" to Wiring().promptFor(message), staged = ctx.staged))
                // The step is COMMITTED by now. The lease must still be outstanding: a
                // crash here has to re-deliver rather than lose the work item (12.2).
                unackedAtCommitTime += mailbox.unacked().size
                delay(500)
            },
        )
        val job = launch { h.consumer.run() }

        mailbox.post(inputOf(TICKETS, "k1", "ticket 4118"))
        advanceTimeBy(10)
        assertContentEquals(listOf(1), unackedAtCommitTime, "committed, NOT YET acked")

        // CRASH SIMULATION: the lease expires before the ack and the queue re-delivers.
        mailbox.redeliver()
        advanceUntilIdle()

        val findings = h.app.bus.records()
            .flatMap { it.commands }
            .filterIsInstance<ArtifactCommand.RecordFinding>()
        assertEquals(1, findings.size, "redelivery is SAFE: the key was already folded, so it ran once")

        val drop = h.app.bus.records()
            .flatMap { it.commands }
            .filterIsInstance<InboxCommand.NoteDrop>()
            .single()
        assertEquals(DropReason.Duplicate, drop.reason)
        assertEquals(mapOf(TICKETS to 1), h.app.state.inbox.duplicates)

        // …and after the ack there is nothing left to re-deliver.
        assertTrue(mailbox.unacked().isEmpty())
        val settledRecords = h.app.bus.records().size
        mailbox.redeliver()
        advanceUntilIdle()
        assertEquals(settledRecords, h.app.bus.records().size, "acked work is never re-delivered")
        job.cancelAndJoin()
    }

    // ── 6 · 12.4 · a thrown turn degrades; the consumer is the heartbeat ────
    @Test
    fun `12_4 - a turn that THROWS degrades to a typed status and never kills the consumer`() = runTest {
        val h = Barge(
            runner = TurnRunner { message, ctx ->
                val input = message as? Message.Input
                check(input?.key != SourceKey("boom")) { "backend timeout" }
                ctx.submit(stepOf(RECORD_FINDING, "text" to Wiring().promptFor(message), staged = ctx.staged))
            },
        )
        val job = launch { h.consumer.run() }

        h.mailbox.post(inputOf(TICKETS, "boom", "the one that explodes"))
        h.mailbox.post(inputOf(TICKETS, "ok", "the one after it"))
        advanceUntilIdle()

        assertFalse(h.consumer.isStopped, "THE CONSUMER LIVES")
        assertEquals(TurnOutcome.Threw("backend timeout"), h.consumer.settled.first())
        assertTrue(
            h.app.bus.records().any { r ->
                r.commands.any { it is InboxCommand.NoteFault && it.fault == "backend timeout" }
            },
            "the cause is CARRIED, folded and signed — not swallowed",
        )
        assertTrue(
            h.app.controller.view.artifact.lines.contains("the one after it"),
            "and the next message was processed normally",
        )
        assertEquals("ok", h.app.controller.view.root.banner, "a failed turn is per-item, not session-global")
        job.cancelAndJoin()
    }

    // ── 7 · Drain DEFERS. It is the one message that never preempts ─────────
    @Test
    fun `DRAIN - defers to the running turn, then finalizes, then stops`() = runTest {
        val h = Barge(
            runner = TurnRunner { message, ctx ->
                ctx.submit(stepOf(RECORD_FINDING, "text" to "step 1", staged = ctx.staged))
                // Comfortably inside DRAIN_DEADLINE_MS: this turn cooperates, so the
                // defer completes on the turn's own terms rather than on the bound's.
                delay(300)
                ctx.submit(stepOf(RECORD_FINDING, "text" to "step 2", staged = ctx.staged))
            },
        )
        val job = launch { h.consumer.run() }
        h.mailbox.post(inputOf(TICKETS, "k1", "reading"))
        advanceTimeBy(10)
        h.mailbox.post(Message.Drain(OPERATOR, "shutting down"))

        // No cancel: a Drain ENDS the loop, so run() returns on its own.
        job.join()

        assertEquals(
            listOf("step 1", "step 2"),
            h.app.controller.view.artifact.lines,
            "the Drain WAITED: both of the running turn's steps folded, and neither was cancelled",
        )
        assertEquals(listOf(TurnOutcome.Ok(2)), h.consumer.settled)
        assertTrue(h.app.state.artifact.seal is SealStatus.Sealing, "…then it finalized")
        assertTrue(h.consumer.isStopped, "…then it stopped")
        assertTrue(h.mailbox.unacked().isEmpty())
    }
}
