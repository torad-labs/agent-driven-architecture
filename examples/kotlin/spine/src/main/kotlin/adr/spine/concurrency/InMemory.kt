// ── spine/concurrency/in-memory — the deterministic barge-in adapters ──────
// The same idea as spine/boundary/in-memory: everything that would otherwise be
// ambient lives behind a port so the whole system can be driven offline and
// re-driven identically. Here that is the mailbox's LEASE/ACK behaviour and the
// relay's append-only store.
//
// Neither of these reads a clock. `publish(at, text)` is handed the timestamp the
// boundary already read (G9), which is why a recalled `publishedAt` replays exactly.

package adr.spine.concurrency

import adr.spine.ports.Mailbox
import adr.spine.ports.RelayRead
import adr.spine.pure.Message
import adr.spine.pure.RelayEntry
import adr.spine.pure.Timestamp
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel

/**
 * A mailbox with a real lease: `post` records the message as UNACKED, receiving it
 * does not remove it, and only [Mailbox.ack] does — which the consumer calls after
 * the commit (12.2).
 *
 * [redeliver] is the crash simulation: everything still unacked goes back on the
 * channel, exactly as a durable queue would re-deliver a lease that expired without
 * an ack. That redelivery is SAFE because the durable policy dedupes on the source
 * key — which is the pair of properties 12.2 asks for, tested together.
 */
class InMemoryMailbox : Mailbox {
    private val channel = Channel<Message>(Channel.UNLIMITED)
    private val outstanding = mutableListOf<Message>()

    override val messages: ReceiveChannel<Message> get() = channel

    override fun post(message: Message) {
        outstanding += message
        channel.trySend(message)
    }

    override fun ack(message: Message) {
        outstanding.remove(message)
    }

    /** What the consumer has taken or been offered but has not finished with. */
    fun unacked(): List<Message> = outstanding.toList()

    /** Crash simulation: re-deliver every unacked lease. */
    fun redeliver() {
        outstanding.toList().forEach { channel.trySend(it) }
    }
}

/**
 * The append-only relay both tiers meet at (11.2). The deep tier appends; the fast
 * tier reads the newest entry through [RelayRead] and NOTHING ELSE — no method
 * handle on the peer tier, no shared mutable object, no synchronous request.
 *
 * [gate] is how a test makes the relay slow without a wall-clock sleep: hand it a
 * suspend function that never returns and the fast tier must still start its turn
 * inside `RECALL_DEADLINE_MS`.
 */
/**
 * A suspending barrier a test hands the relay to make a race deterministic. It lives
 * HERE, not in spine/pure: `suspend` is I/O-shaped and gate check C8 denies it in the
 * pure ring — the gate rejected the first placement, which is the gate working.
 */
fun interface Barrier {
    suspend operator fun invoke()
}

class InMemoryRelay(private val gate: Barrier = Barrier {}) : RelayRead {
    private val entries = mutableListOf<RelayEntry>()

    /** The deep tier's write side, reached through blocks/analysis's own port at the root. */
    fun publish(at: Timestamp, text: String) {
        entries += RelayEntry(at, text)
    }

    /** Every conclusion ever published, in order. Append-only: nothing is ever revised. */
    fun published(): List<RelayEntry> = entries.toList()

    override suspend fun latest(): RelayEntry? {
        gate()
        return entries.lastOrNull()
    }
}
