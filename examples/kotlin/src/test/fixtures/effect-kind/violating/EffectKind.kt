// ── fixture (BLOCK-TEST: two effect kinds, a performer that answers one) ───
// THE HANDLER SPLIT'S HEADLINE, earned by the compiler: a NOVEL EFFECT KIND breaks
// the build at ONE site, and that site is the owning block's own performer. Before
// the split the same append broke `app/Wire.kt` — the composition root's exhaustive
// `when` over Effect — and broke nothing inside the block folder at all.
//
// The sub-union is re-declared HERE rather than extended from `:spine`, and that is a
// language constraint rather than a shortcut: every variant of a sealed hierarchy must
// live in one module, so a fixture compiled on its own cannot append a case to the real
// `TriageEffect`. What it CAN do — and what the escalation fixture beside it already
// does for TicketStatus — is hold a faithful copy of the consumer against the real
// spine vocabulary, written exactly the way the live one is: `when` AS AN EXPRESSION,
// every variant named, NO else arm. That is what makes the compiler, not a reviewer,
// produce the edit list.
//
// The LIVE half of the claim — that no PRODUCTION file outside the block folder names
// the sub-union at all, and that the only out-of-folder cost left is the gate's own
// totality ledger — is asserted against the real trees in GateTest.

package adr.fixture.effectkind

import adr.spine.pure.Emit
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

sealed class DemoEffect(open val at: Timestamp) {

    data class LogDecision(override val at: Timestamp, val ticket: TicketId) : DemoEffect(at)

    /** THE NOVEL KIND. Nothing below it was touched — that is the point. */
    data class NotifyReporter(override val at: Timestamp, val ticket: TicketId) : DemoEffect(at)
}

class DemoBlock(private val emit: Emit<String>) {

    // ── THE ONE SITE — the block's own performer, inside the block's own folder ──
    fun perform(effect: DemoEffect): Unit = when (effect) {
        is DemoEffect.LogDecision -> emit("decision ${effect.ticket.value} at ${effect.at.value}")
    }
}
