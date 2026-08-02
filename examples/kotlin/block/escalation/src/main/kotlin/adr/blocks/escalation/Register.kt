// ── blocks/escalation/register — THE ONE PUBLIC SYMBOL (G11) ───────────
// A CLASS, not an `object`, for the reason blocks/triage/register spells out: an
// uninstantiable facade delegating to top-level functions hosts the same disease
// twice. Read the two files together — this one is a scripted derivation of that one,
// with no new thinking and no new risk.

package adr.blocks.escalation

import adr.contract.EscalationEffect
import adr.contract.EscalationResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Block
import adr.spine.pure.BlockRegistration
import adr.spine.pure.EffectPerformer
import adr.spine.pure.Lens
import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

class EscalationBlock : Block<EscalationSlice, EscalationResult, EscalationView> {

    private val armImpl = EscalationArm()
    private val projection = EscalationProjection()

    fun <S> register(lens: Lens<S, EscalationSlice>): BlockRegistration<S> =
        BlockRegistration(block = "escalation", verbs = EscalationTools(lens).verbs())

    /**
     * THE EFFECT PERFORMER. Registered exactly like the verbs above, and for the same
     * reason: performing a [EscalationEffect] is this block's business, and it closes
     * over the block's own OncallPort — bound at the root, named nowhere else.
     *
     * The `when` is over this block's OWN sealed sub-union with no else arm, so a case
     * it does not answer is a compile error HERE, in the folder that owns it. That is
     * the whole claim: a novel effect kind costs zero PRODUCTION sites outside the folder.
     */
    fun performer(oncall: OncallPort): EffectPerformer<EscalationEffect> = EffectPerformer(
        block = "escalation",
        narrow = { it as? EscalationEffect },
        perform = { effect ->
            when (effect) {
                is EscalationEffect.PageOncall -> oncall.page(effect.ticket)
            }
        },
    )

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

    fun contextLines(slice: EscalationSlice, maxLines: Int = MAX_CONTEXT_LINES_PER_BLOCK): List<String> =
        projection.contextLines(slice, maxLines)
}
