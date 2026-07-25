// ── test/blocks/escalation — the block IN ISOLATION (G13) ─────────────────
// F9 OLD (measured):
//   confirm with NO prior Request (ticket Open) → PageOncall fired, status Escalated
//   confirm on a ticket absent from State       → PageOncall("nope") fired AND run → Degraded

package adr.blocks

import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.EscalationBlock
import adr.blocks.escalation.EscalationSlice
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.blocks.escalation.TicketStatus
import adr.contract.EscalationEffect
import adr.contract.EscalationResult
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

class EscalationBlockTest {

    private val ticket = TicketId("4118")
    private val now = Timestamp(9)
    private val asked = Signature(Actor.Agent, Authority("agent-run-7f"))
    private val confirmer = Signature(Actor.Agent, Authority("policy-tier-v3"))
    private val slice = EscalationSlice.of(listOf(ticket))

    /** The block is CONSTRUCTED here — no root, no registry, no boundary (G13). */
    private val block = EscalationBlock()

    @Test
    fun `a request is reversible - it records who asked and fires nothing`() {
        val out = block.arm(slice, EscalationResult.RequestEscalation(REQUEST_ESCALATION, ticket), now, asked)

        val status = assertIs<TicketStatus.Escalating>(out.slice.statusOf(ticket))
        assertEquals(Authority("agent-run-7f"), status.requestedBy)
        assertTrue(out.effects.isEmpty(), "a request pages nobody")
    }

    @Test
    fun `a confirm on a pending request transitions and earns the irreversible effect`() {
        val pending = slice.with(TicketStatus.Escalating(ticket, Authority("agent-run-7f")))
        val out = block.arm(pending, EscalationResult.ConfirmEscalation(CONFIRM_ESCALATION, ticket), now, confirmer)

        val status = assertIs<TicketStatus.Escalated>(out.slice.statusOf(ticket))
        assertEquals(Authority("policy-tier-v3"), status.confirmedBy)
        assertEquals(listOf(EscalationEffect.PageOncall(now, ticket)), out.effects)
    }

    @Test
    fun `F9 - a confirm with no pending request mutates nothing and fires nothing`() {
        val out = block.arm(slice, EscalationResult.ConfirmEscalation(CONFIRM_ESCALATION, ticket), now, confirmer)

        assertEquals(slice, out.slice)
        assertTrue(out.effects.isEmpty())
        assertIs<Notice.Rejected>(out.notices.single())
    }

    @Test
    fun `F9 - a confirm on an absent ticket is a PER-ITEM rejection, never a session status`() {
        val out = block.arm(
            slice,
            EscalationResult.ConfirmEscalation(CONFIRM_ESCALATION, TicketId("nope")),
            now,
            confirmer,
        )

        assertEquals(slice, out.slice)
        assertTrue(out.effects.isEmpty())
        assertEquals("unknown ticket nope", out.notices.single().reason)
        // There is no way for this arm to touch RunStatus at all — gate check C6.
    }

    @Test
    fun `the view pre-decides every flag - the surface computes nothing`() {
        val pending = slice.with(TicketStatus.Escalating(ticket, Authority("host:marcos")))
        val row = block.view(pending).rows.single()

        assertTrue(row.escalating)
        assertTrue(!row.canEscalate)
        assertTrue(!row.escalated)
        assertEquals("escalating (asked by host:marcos)", row.state)
    }

    @Test
    fun `contextLines reports the pending request to the reasoner`() {
        val pending = slice.with(TicketStatus.Escalating(ticket, Authority("host:marcos")))
        assertEquals(
            listOf("ticket 4118 has a PENDING escalation request"),
            block.contextLines(pending),
        )
    }
}
