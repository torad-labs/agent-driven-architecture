// ── spine/concurrency/consumer — the barge-in loop that ACTUALLY PREEMPTS (12) ─
//
// F11, restated so it cannot be re-shipped. The book's 12.3 drain loop puts
// `outcome = await(inFlight)` at LOOP-BODY indentation while `mailbox.take()` blocks
// at the top. Under the ordinary reading of await, control never reaches take()
// during a turn: `turnInFlight` is false at every take(), all three guards are dead,
// and Fig 12.1's mid-turn "take Interrupt" is unproducible. The loop cannot preempt.
//
// THE FIX IS ONE LINE OF SHAPE: a `select` over { a message arrived, the turn
// settled }, so a message is observable WHILE a turn runs.
//
//     select {
//         mailbox.messages.onReceive { Arrived(it) }     ← the whole fix
//         running?.job?.onJoin      { Settled }
//     }
//
// `select` is ATOMIC — a losing `onReceive` clause does not consume — so Kotlin
// needs no re-arm bookkeeping and no message can be raced into a hole.
//
// THE THREE POLICIES (12.2/12.3), each with a test that proves it:
//
//   Input      per SOURCE, a closed choice, defaulting to DurableQueue.
//              Perishable   → conflate to the newest; a busy-drop FOLDS A COUNTER.
//              DurableQueue → never conflate; dedupe on the key; ack after commit.
//   Interrupt  PREEMPT: cancel the in-flight turn and JOIN it before the interrupt's
//              turn starts, so two folds can never interleave.
//   Drain      DEFER: wait for the running turn, then finalize. NEVER cancels.
//
// THE RUN-STATE HANDLE EXISTS, and denying it is what made 12.3 unimplementable.
// Its safety does not come from being absent; it comes from SINGLE-CONSUMER
// OWNERSHIP: exactly one loop reads or writes it, so it is never shared and needs no
// lock. That is the difference between "no mutable state" (false) and "no SHARED
// mutable state" (true, and the whole point).
//
// THE TURN RUNNER IS INJECTED, NOT IMPORTED. This folder never names the agent-loop
// SDK — that stays confined to spine/agent/loop (G3, gate check C1) — and it
// never names a block or the root (C15).
//
// DISPATCHER CONFINEMENT (law, and not gate-checkable — see the README's
// specified-but-unproven table). The consumer creates the turn's scope, and `submit`
// is reached only through the closure minted here, on the consumer's own dispatcher.
// No turn can reach the boundary from another thread, so onStepFinish stays serial.

package adr.spine.concurrency

import adr.spine.boundary.FinishedStep
import adr.spine.boundary.Submit
import adr.spine.ports.Mailbox
import adr.spine.ports.RelayRead
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.CANCEL_DEADLINE_MS
import adr.spine.pure.ConsumerEvent
import adr.spine.pure.DRAIN_DEADLINE_MS
import adr.spine.pure.InputPolicies
import adr.spine.pure.InputPolicy
import adr.spine.pure.Message
import adr.spine.pure.Millis
import adr.spine.pure.RECALL_DEADLINE_MS
import adr.spine.pure.Recall
import adr.spine.pure.RelayEntry
import adr.spine.pure.Report
import adr.spine.pure.SourceKey
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.TurnOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.withTimeoutOrNull

/**
 * What one turn is handed: the off-bus inputs staged for it, and the ONE channel it
 * has into the system.
 */
interface TurnContext {
    /** The ordered staged inputs — `[Perceived?, Recalled?]`, already bounded and captured. */
    val staged: List<StagedInput>

    /**
     * The turn's ONLY route to the boundary, and it is REVOCABLE. A turn that
     * ignores cancellation and submits after the deadline is DROPPED, not folded.
     */
    fun submit(step: FinishedStep)
}

/** What actually runs a turn. Injected, so this folder never names the agent-loop SDK. */
fun interface TurnRunner {
    /** May throw; may be cancelled. The consumer degrades both into a [TurnOutcome]. */
    suspend fun run(message: Message, ctx: TurnContext)
}

/**
 * The revocation latch — the load-bearing move of §1.6.
 *
 * A turn's only channel into the system is this closure. `revoke()` flips a one-way
 * latch inside it, so 12.3's "two folds cannot interleave" holds EVEN WHEN THE JOIN
 * FAILS. Cancellation is at a step boundary with the deadline AS the boundary:
 * steps that completed before it are durably folded and their effects performed;
 * steps after it are refused entry. There is no hidden rollback.
 */
private class SubmitGate(
    override val staged: List<StagedInput>,
    private val downstream: Submit,
) : TurnContext {
    private var revoked = false

    var steps: Int = 0
        private set

    fun revoke() {
        revoked = true
    }

    override fun submit(step: FinishedStep) {
        if (revoked) return
        steps += 1
        downstream(step)
    }
}

/** The consumer's private bookkeeping for one in-flight turn. Never shared. */
private class Turn(val message: Message, val gate: SubmitGate) {
    val source: SourceName get() = message.source
    var cancelledBy: SourceName? = null
    var outcome: TurnOutcome = TurnOutcome.Idle
}

/** THE run-state handle 12.1 denied having. Single-owner, therefore lock-free. */
private sealed interface RunState {
    data object Idle : RunState

    data class Running(val turn: Turn, val job: Job) : RunState
}

/** What woke the loop. Closed, so the loop body is exhaustive with no else arm. */
private sealed interface Wake {
    data class Arrived(val message: Message) : Wake

    data object Settled : Wake
}

/** A completed relay read, boxed so "timed out" is distinguishable from "nothing published". */
private data class Read(val entry: RelayEntry?)

/**
 * ONE consumer, ONE turn at a time, and every barge-in decision reported rather than
 * swallowed.
 *
 * @param report REQUIRED — default-deny applied to observability. The composition
 *   root maps each spine-shaped event to app Actions, which then travel the ONE
 *   existing path (resolveAction → gate → fold → commit → signed Command). A
 *   busy-drop is a decision, so it signs, exactly like A1's presentation verbs.
 * @param finalize what a Drain commits before the consumer stops (the session seal).
 * @param recovered the durable dedupe scope, REBUILT FROM THE TIMELINE at recovery:
 *   every source key a committed step already consumed (`Recovery` in spine/replay).
 *   A consumer seeded with it refuses the redelivery of work that committed before a
 *   crash — the half of "each work item folds exactly once" (12.2) that an in-memory
 *   set cannot carry alone.
 * @param relay optional. Wire one and every turn is staged with a BOUNDED recall of
 *   the peer tier's newest conclusion; leave it null and the tier rung costs nothing.
 */
class SerialConsumer(
    private val mailbox: Mailbox,
    private val runner: TurnRunner,
    private val submit: Submit,
    private val report: Report<ConsumerEvent>,
    private val finalize: Report<Message.Drain>,
    private val policies: List<InputPolicy> = emptyList(),
    recovered: Set<SourceKey> = emptySet(),
    private val relay: RelayRead? = null,
    private val recallSource: SourceName = SourceName("relay"),
    private val cancelDeadlineMs: Millis = CANCEL_DEADLINE_MS,
    private val drainDeadlineMs: Millis = DRAIN_DEADLINE_MS,
    private val recallDeadlineMs: Millis = RECALL_DEADLINE_MS,
) {
    private var runState: RunState = RunState.Idle
    private var taking = true
    private var stopped = false

    /** At most ONE taken-but-unstarted Input. The mailbox — a real queue — holds the rest. */
    private var pending: Message.Input? = null
    private var dropped = 0

    /** The durable dedupe scope: seeded from the timeline ([recovered]), grown
     *  in-session. The KEY rides the committed `Perceived` fixture, so this set is
     *  always re-derivable from the bus — restart does not reset it. */
    private val seen: MutableSet<SourceKey> = recovered.toMutableSet()

    /** Consumer-owned, single-writer: the newest entry a successful recall ever returned. */
    private var lastKnown: RelayEntry? = null

    private val outcomes = mutableListOf<TurnOutcome>()

    /** Every turn that SETTLED, in order. An abandoned turn never settles and is absent. */
    val settled: List<TurnOutcome> get() = outcomes.toList()

    /** True once a Drain has finalized. The consumer stops; it is never killed. */
    val isStopped: Boolean get() = stopped

    /**
     * The loop. It runs until a Drain finalizes, and NOTHING a turn does can end it:
     * a thrown turn degrades to [TurnOutcome.Threw] inside the runner wrapper, so the
     * exception never crosses this frame (12.4). The consumer is the heartbeat.
     */
    suspend fun run(): Unit = coroutineScope {
        while (isActive && !stopped) {
            val wake = select {
                val running = runState as? RunState.Running
                // Re-arm the take unless a durable Input is being held back (backpressure).
                if (taking || running == null) {
                    mailbox.messages.onReceive { Wake.Arrived(it) }
                }
                running?.job?.onJoin { Wake.Settled }
            }
            when (wake) {
                is Wake.Arrived -> onMessage(this, wake.message)
                Wake.Settled -> onSettled(this)
            }
        }
    }

    private suspend fun onMessage(scope: CoroutineScope, message: Message) {
        when (message) {
            is Message.Input -> onInput(scope, message)
            is Message.Interrupt -> onInterrupt(scope, message)
            is Message.Drain -> onDrain(message)
        }
    }

    private suspend fun onInput(scope: CoroutineScope, message: Message.Input) {
        when (InputPolicies(policies).forSource(message.source)) {
            is InputPolicy.DurableQueue -> onDurable(scope, message)
            is InputPolicy.Perishable -> onPerishable(scope, message)
        }
    }

    /** 12.2's own note: for a durable queue, do NOT conflate. Dedupe, queue, ack on commit. */
    private suspend fun onDurable(scope: CoroutineScope, message: Message.Input) {
        if (seen.contains(message.staged.key)) {
            emit(ConsumerEvent.Duplicate(message.source, message.staged.key))
            mailbox.ack(message)
            return
        }
        if (runState is RunState.Running) {
            // BACKPRESSURE, not buffering: hold exactly one and stop re-arming take().
            pending = message
            taking = false
            return
        }
        seen += message.staged.key
        start(scope, message)
    }

    /** 12.2's newest-input-wins. The drop is never silent: it folds a counted Command. */
    private suspend fun onPerishable(scope: CoroutineScope, message: Message.Input) {
        if (runState is RunState.Running) {
            pending?.let { superseded ->
                dropped += 1
                mailbox.ack(superseded)
            }
            pending = message
            return
        }
        start(scope, message)
    }

    /** PREEMPT (12.3): cancel, JOIN — bounded — and only then start the interrupt's turn. */
    private suspend fun onInterrupt(scope: CoroutineScope, message: Message.Interrupt) {
        (runState as? RunState.Running)?.let { running ->
            cancelAndJoin(running, message.source)
        }
        start(scope, message)
    }

    /** DEFER (12.3): wait for the running turn — never cancel it — then finalize and stop. */
    private suspend fun onDrain(message: Message.Drain) {
        (runState as? RunState.Running)?.let { running ->
            runState = RunState.Idle
            joinWithin(running, drainDeadlineMs)
        }
        emitActions(finalize(message))
        mailbox.ack(message)
        stopped = true
    }

    /**
     * Cancel-and-join with a REAL bound, because 12.3's own honest caveat is that an
     * unbounded join is exactly a hang.
     *
     * On timeout the turn is ABANDONED: its submit channel is revoked, the event is
     * folded as a signed Command, and the new turn starts anyway. The abandoned
     * coroutine may never unwind — that leak is named, degraded and counted, and the
     * only way to remove it is the unbounded join 12.3 calls a hang.
     */
    private suspend fun cancelAndJoin(running: RunState.Running, by: SourceName) {
        runState = RunState.Idle
        running.turn.cancelledBy = by
        running.job.cancel()
        joinWithin(running, cancelDeadlineMs)
    }

    private suspend fun joinWithin(running: RunState.Running, bound: Millis) {
        val joined = withTimeoutOrNull(bound) { running.job.join() }
        if (joined == null) {
            // NOT acked: the abandoned turn never settled, so its lease stays out
            // and a restart re-delivers rather than loses. `revoke()` is what keeps
            // the abandoned coroutine from folding anything after this line.
            running.turn.gate.revoke()
            emit(ConsumerEvent.CancelDeadlineExceeded(running.turn.source, bound))
            return
        }
        finish(running.turn)
    }

    private suspend fun onSettled(scope: CoroutineScope) {
        val running = runState as? RunState.Running ?: return
        runState = RunState.Idle
        finish(running.turn)
        startPending(scope)
    }

    /**
     * ACK AFTER THE COMMIT (12.2). By the time a turn settles its steps are already on
     * the bus, so a crash between take and ack re-delivers rather than loses — and the
     * durable policy's key dedupe is what makes that redelivery safe: [seen] is seeded
     * from the timeline at construction, so the scope survives the restart that
     * redelivery exists for.
     *
     * A turn that THREW is not acked: the lease stays out, a restart re-delivers, and
     * the timeline decides — a key that committed is refused, one that never committed
     * is retried.
     */
    private fun finish(turn: Turn) {
        outcomes += turn.outcome
        when (val outcome = turn.outcome) {
            is TurnOutcome.Ok -> mailbox.ack(turn.message)
            is TurnOutcome.Cancelled -> mailbox.ack(turn.message)
            TurnOutcome.Idle -> mailbox.ack(turn.message)
            // 12.4: a failed turn becomes a typed status carrying its cause — and it
            // is NOT acked, so the lease stays out and a crash re-delivers rather
            // than loses. The exception never crossed the loop; the consumer is the
            // heartbeat and it does not stop.
            is TurnOutcome.Threw -> emit(ConsumerEvent.TurnFailed(turn.source, outcome.fault))
        }
    }

    private suspend fun startPending(scope: CoroutineScope) {
        taking = true
        val next = pending ?: return
        pending = null
        if (dropped > 0) {
            // Folded BEFORE the next turn starts, so the conflation line is in the
            // context digest that turn's steps are reasoned against: the model is told
            // it is shedding load.
            emit(ConsumerEvent.Conflated(next.source, dropped))
            dropped = 0
        }
        if (InputPolicies(policies).forSource(next.source) is InputPolicy.DurableQueue) {
            seen += next.staged.key
        }
        start(scope, next)
    }

    private suspend fun start(scope: CoroutineScope, message: Message) {
        val gate = SubmitGate(stageFor(message), submit)
        val turn = Turn(message, gate)
        val job = scope.launch {
            turn.outcome = try {
                runner.run(message, gate)
                TurnOutcome.Ok(gate.steps)
            } catch (cancelled: CancellationException) {
                TurnOutcome.Cancelled(turn.cancelledBy ?: turn.source)
            } catch (fault: Throwable) {
                // 12.4: the exception is captured HERE, so the select above can never
                // see a failure and the consumer cannot be killed by a bad message.
                TurnOutcome.Threw(fault.message ?: fault.toString())
            }
        }
        runState = RunState.Running(turn, job)
    }

    /**
     * Stage this turn's off-bus inputs. ORDER IS PINNED: perception first, recall
     * second — it reaches the rendered digest, so it is law (5.4).
     *
     * THE RELAY IS READ ONCE PER TURN, before the turn starts. `Fresh` therefore
     * means "fresh as of turn start", not as of the step.
     */
    private suspend fun stageFor(message: Message): List<StagedInput> {
        val perceived = (message as? Message.Input)?.staged
        val recalled = relay?.let { StagedInput.Recalled(recallSource, recallFrom(it)) }
        return listOfNotNull(perceived, recalled)
    }

    /**
     * THE PARTY THAT MUST NOT BLOCK DOES THE BOUNDING. The port is allowed to be slow
     * and allowed never to return; the deadline lives here, and the degrade is TYPED
     * so no consumer can present stale as fresh.
     */
    private suspend fun recallFrom(port: RelayRead): Recall {
        val read = withTimeoutOrNull(recallDeadlineMs) { Read(port.latest()) }
            ?: return lastKnown?.let { Recall.LastKnown(it.text, it.publishedAt) } ?: Recall.Empty
        val entry = read.entry ?: return Recall.Empty
        lastKnown = entry
        return Recall.Fresh(entry.text, entry.publishedAt)
    }

    private fun emit(event: ConsumerEvent) = emitActions(report(event))

    /**
     * THE ONE STAMP SITE for consumer-authored steps, and it serves BOTH callers:
     * `emit(ConsumerEvent)` just above, and the drain seal — `emitActions(finalize(message))`
     * in `onDrain`. `Actor.Spine`, not `Actor.Agent`: no model chose a conflation, a
     * fault or a blown deadline, and a timeline that stamped them `Agent` was lying
     * about authorship in the one record that is supposed to be the truth.
     */
    private fun emitActions(actions: List<Action>) {
        if (actions.isEmpty()) return
        submit(FinishedStep(by = Actor.Spine, staged = emptyList(), actions = actions))
    }
}
