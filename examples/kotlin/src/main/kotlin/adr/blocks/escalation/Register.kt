// ── blocks/escalation/register — THE ONE PUBLIC SYMBOL (I7, L1) ────────────

package adr.blocks.escalation

import adr.contract.EscalationResult
import adr.spine.pure.ArmOut
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

object Escalation {
    val initial: EscalationSlice get() = EscalationSlice(emptyMap())

    fun slice(tickets: List<TicketId>): EscalationSlice = EscalationSlice.of(tickets)

    fun <S> register(lens: (S) -> EscalationSlice): BlockRegistration<S> =
        BlockRegistration(block = "escalation", verbs = escalationVerbs(lens))

    fun arm(
        slice: EscalationSlice,
        result: EscalationResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<EscalationSlice> = escalationArm(slice, result, now, sig)

    fun view(slice: EscalationSlice): EscalationView = escalationView(slice)

    fun contextLines(slice: EscalationSlice): List<String> = escalationContextLines(slice)
}
