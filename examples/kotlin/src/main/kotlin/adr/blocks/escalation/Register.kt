// ── blocks/escalation/register — THE ONE PUBLIC SYMBOL (I7, L1) ────────────
// A CLASS, not an `object`, for the reason blocks/triage/register spells out: an
// uninstantiable facade delegating to top-level functions hosts the same disease
// twice. Read the two files together — this one is a scripted derivation of that one,
// with no new thinking and no new risk.

package adr.blocks.escalation

import adr.contract.EscalationResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Block
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Lens
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

class EscalationBlock : Block<EscalationSlice, EscalationResult, EscalationView> {

    private val armImpl = EscalationArm()
    private val projection = EscalationProjection()

    fun <S> register(lens: Lens<S, EscalationSlice>): BlockRegistration<S> =
        BlockRegistration(block = "escalation", verbs = EscalationTools(lens).verbs())

    override fun arm(
        slice: EscalationSlice,
        result: EscalationResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<EscalationSlice> = armImpl.arm(slice, result, now, sig)

    /** The SEEDED slice — on the block, not on a companion of the shape. */
    fun slice(tickets: List<TicketId>): EscalationSlice =
        EscalationSlice(tickets.associateWith { TicketStatus.Open(it) })

    override fun view(slice: EscalationSlice): EscalationView = projection.view(slice)

    fun contextLines(slice: EscalationSlice): List<String> = projection.contextLines(slice)
}
