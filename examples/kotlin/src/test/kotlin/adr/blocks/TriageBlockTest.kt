// ── test/blocks/triage — the block IN ISOLATION (G13) ─────────────────────
// No siblings, no root, no live adapters: feed a verb, fold the arm, assert the
// slice and the effects. This is the test layer the shipped ports never had.
//
// the OLD shape, MEASURED (12.4): setPriority on unknown ticket 9999 → Effect.Log performed,
// SetPriority committed, folded state UNCHANGED. A clean-looking audit record for a
// mutation that never happened.

package adr.blocks

import adr.contract.TriageResult.Priority
import adr.blocks.triage.SET_PRIORITY
import adr.blocks.triage.Ticket
import adr.blocks.triage.TriageBlock
import adr.blocks.triage.TriageSlice
import adr.contract.TriageEffect
import adr.contract.TriageResult
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class TriageBlockTest {

    private val sig = Signature(Actor.Agent, Authority("agent-run-7f"))
    private val now = Timestamp(9)
    private val slice = TriageBlock().slice(listOf(Ticket(TicketId("4118"), "refund not received")))

    /** The block is CONSTRUCTED here — no root, no registry, no boundary (G13). */
    private val block = TriageBlock()

    @Test
    fun `a known ticket transitions and earns exactly one effect`() {
        val out = block.arm(
            slice,
            TriageResult.SetPriority(SET_PRIORITY, TicketId("4118"), Priority.High, reason = null),
            now,
            sig,
        )

        assertEquals(Priority.High, out.slice.priority.getValue(TicketId("4118")))
        assertEquals(
            listOf(
                TriageEffect.LogDecision(
                    now,
                    TicketId("4118"),
                    Priority.High,
                    supersedes = null,
                    reason = null,
                ),
            ),
            out.effects,
        )
        assertTrue(out.notices.isEmpty())
    }

    @Test
    fun `PER-ITEM - an unknown ticket mutates nothing, fires nothing, and leaves ONE notice`() {
        val out = block.arm(
            slice,
            TriageResult.SetPriority(SET_PRIORITY, TicketId("9999"), Priority.High, reason = null),
            now,
            sig,
        )

        assertEquals(slice, out.slice, "no mutation")
        assertTrue(out.effects.isEmpty(), "no effect on a refused transition")
        assertEquals(1, out.notices.size)
        assertIs<Notice.Rejected>(out.notices.single())
        assertEquals("unknown ticket 9999", out.notices.single().reason)
    }

    @Test
    fun `the block's slice is copy-on-write`() {
        val next = slice.withPriority(TicketId("4118"), Priority.Urgent)
        assertEquals(TriageSlice(slice.tickets, emptyMap()), slice)
        assertEquals(Priority.Urgent, next.priority.getValue(TicketId("4118")))
    }
}
