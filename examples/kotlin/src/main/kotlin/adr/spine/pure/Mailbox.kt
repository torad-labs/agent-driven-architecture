// ── spine/pure/mailbox — what a barge-in consumer can be told (12.1–12.3) ──
// Three kinds of message, and the parent declares `source` ONCE so every one of
// them says where it came from. That single property is doing three jobs: it is the
// key conflation counts by, the scope dedupe runs in, and the attribution an
// Interrupt or a Drain carries onto the timeline.
//
// The three policies are the three variants, not three flags on one:
//
//     Input      reason about this          — conflate or queue, per the source's policy
//     Interrupt  PREEMPT                    — cancel the running turn, JOIN it, then run
//     Drain      DEFER, then finalize       — never preempts, never cancels
//
// ZERO I/O: no channel, no coroutine, no clock. The transport is pure; the machinery
// that moves it lives in spine/concurrency (gate check C8).

package adr.spine.pure

/** One thing the consumer can be told. Closed: there is no fourth kind of barge-in. */
sealed interface Message {
    /** Where this came from. Declared once, carried by every variant (L3). */
    val source: SourceName

    /**
     * A stimulus to reason about.
     *
     * `staged` is the NARROW variant — `StagedInput.Perceived`, never `StagedInput`.
     * `Recalled` has exactly ONE production site in the system, the consumer itself
     * (mirroring C7's one-production-site rule for `ToolResult`), so a producer
     * cannot post a forged relay snapshot into a turn.
     *
     * `key` is non-null always: the durable policy dedupes on it, the perishable
     * policy ignores it. No nullable field, no branch, no "which mode am I in?".
     */
    data class Input(
        override val source: SourceName,
        val staged: StagedInput.Perceived,
        val key: SourceKey,
    ) : Message

    /** PREEMPT: the running turn is cancelled and JOINED before this one starts (12.3). */
    data class Interrupt(override val source: SourceName, val reason: String) : Message

    /** DEFER: wait for the running turn, then finalize and stop. Never preempts (12.3). */
    data class Drain(override val source: SourceName, val reason: String) : Message
}

/**
 * How a source's inputs behave when the consumer is busy. A CLOSED CHOICE, per
 * SOURCE — not a boolean and not an app-wide mode, because 12.2's note is about the
 * source's nature and a real deployment routinely has a durable ticket queue and a
 * perishable sensor feed at the same time.
 *
 * **The default is [DurableQueue]** ([policyFor] below). Three reasons, in order:
 *
 *  1. 12.2 says newest-input-wins is "exactly wrong for a durable work queue (the
 *     flagship server-agent deployment)". A default that is wrong for the flagship
 *     deployment is the wrong default.
 *  2. The failure modes are asymmetric. Durable-on-perishable processes stale items:
 *     wasteful, observable, recoverable. Perishable-on-durable SILENTLY LOSES WORK.
 *  3. It matches 14.3's posture: the safe classification is the default and the
 *     cheap one has to be declared and reviewed — exactly what `Verb` already does
 *     for reversibility.
 */
sealed interface InputPolicy {
    /** The source this policy governs. Declared once (L3). */
    val source: SourceName

    /** Newest-input-wins: while busy, conflate to the latest and COUNT the drops (12.2). */
    data class Perishable(override val source: SourceName) : InputPolicy

    /** Never conflate: dedupe on the source key and ack only after the commit (12.2). */
    data class DurableQueue(override val source: SourceName) : InputPolicy
}

/**
 * The per-source policy table. The LIST is the same on every lookup inside one
 * consumer, so it is constructor state and drops out of the call — the split the
 * boundary's ActionResolution already makes. An unlisted source gets
 * [InputPolicy.DurableQueue]: documented, not silent.
 */
class InputPolicies(private val policies: List<InputPolicy>) {
    fun forSource(source: SourceName): InputPolicy =
        policies.firstOrNull { it.source == source } ?: InputPolicy.DurableQueue(source)
}

/**
 * How long a cancel may take before the consumer stops waiting on it.
 *
 * 12.3's honest caveat is that an unbounded join is exactly a hang, so the bound is
 * real — and what preserves the no-interleave guarantee when it blows is the
 * REVOCATION LATCH in spine/concurrency/consumer, not the join.
 */
const val CANCEL_DEADLINE_MS: Millis = 200

/** The same bound for a Drain's defer. On timeout it revokes, reports and finalizes anyway. */
const val DRAIN_DEADLINE_MS: Millis = 1_000
