// ── spine/ports/mailbox — the barge-in seam (12.1/12.2) ────────────────────
// A file in spine/ports/ with a body is a gate failure (check C11): a port is a
// published contract, not an implementation. The in-memory implementation lives in
// spine/concurrency/in-memory; a real one is SQS, a Kafka topic or a Postgres queue,
// and 8.5 names "the concurrency / ordering policy of the mailbox" as swappable
// behind exactly this contract.
//
// `messages` is a ReceiveChannel and not a `suspend fun take()` ON PURPOSE. A turn
// must be observable WHILE another turn is running, which means a select over
// { a message arrived, the turn settled }. Kotlin's `select` is ATOMIC — a clause
// that loses does not consume — so a message the race discarded is still in the
// channel. A `suspend take()` would have to be wrapped in a Deferred to be
// selectable, and a Deferred that loses HAS consumed. That difference is the whole
// reason 12.3's drain loop could not preempt.
//
// take LEASES; the message is not gone until `ack`. `ack` is called only AFTER the
// commit (12.2), so a crash between the two re-delivers rather than loses — and the
// durable policy's key dedupe is what makes that redelivery safe.

package adr.spine.ports

import adr.spine.pure.Message
import kotlinx.coroutines.channels.ReceiveChannel

interface Mailbox {
    /** Offer a message. Never blocks the poster on a turn. */
    fun post(message: Message)

    /** The lease stream. Receiving a message does NOT remove it — only [ack] does. */
    val messages: ReceiveChannel<Message>

    /** Called ONLY after the step that consumed the message has committed (12.2). */
    fun ack(message: Message)
}
