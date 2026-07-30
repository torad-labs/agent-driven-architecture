// ── fixture: the OUT-OF-BLOCK STAND-IN consumer ──────────────────────────────
// This file is what makes the exhaustive pair's "and nowhere else" guard able
// to FAIL. A fixture directory holding ONE .kt file cannot produce a second
// filename in the compiler log, so the guard's `elsewhere` set was empty by
// construction for this pair — a wall that cannot fire, which is the one thing
// a wall may never be (review proved it inert as shipped). With this file
// present the set is a real measurement.
//
// It deliberately NEVER matches on the closed TicketStatus union: a fifth
// variant must leave it untouched, so it stays out of the compiler's
// three-site edit list. Rewrite it to `when` over TicketStatus with no else
// arm and the block-test goes red with "the compiler also named [Root.kt]" —
// the reversal this pair keeps as a measured fact.

package adr.fixture.escalation

import adr.spine.pure.TicketId

/** A consumer outside the block's own three sites: it reads the ticket's
 *  IDENTITY, never its closed status vocabulary. */
class RootLedger {
    fun label(ticket: TicketId): String = "ticket ${ticket.value}"
}
