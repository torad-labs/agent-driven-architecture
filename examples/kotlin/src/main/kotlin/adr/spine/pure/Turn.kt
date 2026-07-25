// ── spine/pure/turn — how a turn ENDS, and what the consumer must not swallow ─
// 12.4: a turn that throws degrades to a TYPED STATUS carrying its cause, and the
// consumer lives. The exception never crosses the loop, because the loop is the
// heartbeat and a heartbeat that dies on a bad message is not a heartbeat.
//
// ConsumerEvent is the other half of the same rule: a busy-drop, a duplicate, a
// fault and a blown cancel deadline are all DECISIONS, so none of them may be
// silent (12.2). They are reported out of the consumer as spine-shaped events; the
// composition root maps them to app Actions, and they then travel the ONE existing
// path — resolveAction → gate → fold → commit → signed Command. That is why
// observability here costs the core zero new machinery.
//
// ZERO I/O (gate check C8).

package adr.spine.pure

/** How one turn ended. Closed, so every consumer of an outcome is compiler-checked. */
sealed interface TurnOutcome {
    /** It ran to completion, submitting [steps] steps through the boundary. */
    data class Ok(val steps: Int) : TurnOutcome

    /** 12.4: the turn threw. The cause is carried; THE CONSUMER LIVES. */
    data class Threw(val fault: String) : TurnOutcome

    /** Preempted at a step boundary. Steps completed before the cancel STAY folded. */
    data class Cancelled(val by: SourceName) : TurnOutcome

    /** Nothing to do. "Idle" is a status, not a failure. */
    data object Idle : TurnOutcome
}

/**
 * What the consumer must report rather than swallow. Each one folds as a signed
 * Command through the root's mapping, so "observable, never silent" is a property
 * of the timeline rather than of a log line someone might grep for.
 */
sealed interface ConsumerEvent {
    /** Which source the event is about. Declared once (L3). */
    val source: SourceName

    /** A perishable busy-drop: [dropped] inputs were conflated away (12.2). */
    data class Conflated(override val source: SourceName, val dropped: Int) : ConsumerEvent

    /** A durable redelivery whose key had already been folded — deduped, then acked. */
    data class Duplicate(override val source: SourceName, val key: SourceKey) : ConsumerEvent

    /** 12.4: a turn threw, and this is its cause. */
    data class TurnFailed(override val source: SourceName, val fault: String) : ConsumerEvent

    /**
     * The cancel deadline blew: the turn ignored cancellation, so its submit channel
     * was REVOKED and it was abandoned. The leak is named, degraded and counted —
     * removing it would need an unbounded join, which 12.3 itself calls a hang.
     */
    data class CancelDeadlineExceeded(
        override val source: SourceName,
        val afterMs: Millis,
    ) : ConsumerEvent
}
