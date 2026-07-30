// ── spine/ports/relay — the READ side of the tier relay (11.2) ─────────────
// A deep tier publishes conclusions to an append-only relay; the fast tier reaches
// them ONLY through this port, and only as TEXT. No method handle on the peer tier,
// no shared mutable object, no synchronous request-response. That is what makes
// "the deep tier never stalls the hot loop" structural instead of aspirational.
//
// NOTE WHAT THIS PORT DOES NOT PROMISE. It does not say "I will return within your
// deadline" — a port that promised that would be exactly the aspirational guarantee
// 11.2 warns against, since the party making the promise is the slow one. **The
// party that must not block does the bounding**: the consumer wraps this call in
// `withTimeoutOrNull(RECALL_DEADLINE_MS)` and degrades to a TYPED `Recall.LastKnown`
// or `Recall.Empty`. `latest()` is allowed to be slow, and allowed never to return.
//
// The WRITE side is deliberately NOT here. Publishing is a feature's dependency and
// lives as a block-owned port + adapter (blocks/analysis), bound at the root like
// any other backend seam — so the spine still names no block (C15).

package adr.spine.ports

import adr.spine.pure.RelayEntry

interface RelayRead {
    /** The newest published conclusion, or null when nothing has been published. MAY be slow. */
    suspend fun latest(): RelayEntry?
}
