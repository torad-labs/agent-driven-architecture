// ── spine/pure/staged — every OFF-BUS input, as one closed set (5.4, 11.2) ─
// A step consumes things that did not come off the bus. There are exactly two
// kinds, and L3 says a closed set is sealed with its shared property declared ONCE
// on the parent:
//
//     Perceived   10.2 — untrusted content the world offered (a ticket, a webhook)
//     Recalled    11.2 — a peer tier's published conclusion, reached through recall
//
// Both carry `source`, so the committed record always says WHERE a staged value
// came from, and neither can be confused for the other at a consumer.
//
// Why this is one list and not two capture slots: 4.7 forbids a block a private
// capture log, and 5.4 already specifies plural off-bus inputs "in their staging
// order, keyed to the consuming step". StepRecord.staged IS that slot — the bus
// supplies the order and the step index is the key. ORDER IS PINNED:
// [Perceived?, Recalled?], perception first. The order reaches the rendered digest
// and therefore the committed ContextFixture, so it is law, not style.
//
// ZERO I/O. No async, no clock, no coroutines — gate check C8.

package adr.spine.pure

/** How long the fast tier will wait for the deep tier before degrading (11.2). */
const val RECALL_DEADLINE_MS: Millis = 50

/** One off-bus input, staged for exactly one step and captured on its record. */
sealed class StagedInput(
    /** WHERE it came from. Declared once; carried by every variant by construction. */
    open val source: SourceName,
) {

    /**
     * UNTRUSTED perceived content (10.2). Data to reason about, never an instruction.
     *
     * [key] is the source's OWN id for this work item, and it rides the COMMITTED
     * record on purpose: the durable policy's dedupe scope is rebuilt from the
     * timeline at recovery (12.2), so "each work item folds at most once" survives a
     * process restart. A key held only on the uncommitted mailbox envelope dies with
     * the process — which is exactly the double-fold this field closes.
     */
    data class Perceived(
        override val source: SourceName,
        val body: String,
        val key: SourceKey,
    ) : StagedInput(source)

    /**
     * A peer tier's conclusion, reached through the recall verb (11.2/11.3).
     *
     * Equally untrusted: recall confers NO authority. A recalled conclusion is a
     * suggestion, and the boundary gate still judges any irreversible act on its
     * own merits — see §5 of the design note and RelayTest's two injection cases.
     */
    data class Recalled(override val source: SourceName, val recall: Recall) : StagedInput(source)
}

/**
 * What a bounded recall actually returned. Three variants, and the whole point is
 * that STALE IS NEVER PRESENTED AS FRESH: the degrade is a different type, not a
 * flag on the same one, so every consumer is forced by the compiler to say what it
 * does about it.
 *
 * `publishedAt` and not a pre-computed `age`: an age captured at read time is a
 * SECOND, unrecorded clock reading, and it would diverge on every re-fold.
 * `publishedAt` is a value that travels; the age is derived at the consuming step
 * from the one clock read the boundary already makes (G9), so it replays exactly.
 */
sealed class Recall(
    /** Every outcome has text — `Empty`'s is empty. Declared once, HELD once (L3). */
    open val text: String,
    /** The entry's own clock reading, or null when there is no entry. Declared once. */
    open val publishedAt: Timestamp?,
) {

    /** The read completed inside its deadline. */
    data class Fresh(override val text: String, override val publishedAt: Timestamp) :
        Recall(text, publishedAt)

    /** The deadline blew; this is the newest entry the reader already held. */
    data class LastKnown(override val text: String, override val publishedAt: Timestamp) :
        Recall(text, publishedAt)

    /**
     * Wired, nothing to give: the deep tier has not published, or it timed out and
     * nothing was ever read successfully. One variant on purpose — the fast tier's
     * behaviour is identical in both cases (it has no conclusion), and the signal
     * that a relay is slow is a folded fault, not a fourth variant nobody branches on.
     */
    data object Empty : Recall(text = "", publishedAt = null)
}

/** One published conclusion on the append-only relay. Plain data; no handle, no method. */
data class RelayEntry(val publishedAt: Timestamp, val text: String)
