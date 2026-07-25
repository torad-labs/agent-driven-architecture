// ALLOW-TEST C5 — the arm returns EFFECTS. That is its whole vocabulary.
// Effect declares `at` and carries no identity at all, so there is no field for
// the fold to mint into; the boundary wraps each effect in a KeyedEffect built
// from the offset the append returned. The arm is not deprived of anything — it
// never needed a key, and 14.6's ordering claim becomes unwritable-wrong.
package adr.blocks.escalation

import adr.contract.EscalationEffect
import adr.spine.pure.ArmOut
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

fun escalationArm(slice: EscalationSlice, ticket: TicketId, now: Timestamp): ArmOut<EscalationSlice> =
    ArmOut(slice, listOf(EscalationEffect.PageOncall(now, ticket)))
