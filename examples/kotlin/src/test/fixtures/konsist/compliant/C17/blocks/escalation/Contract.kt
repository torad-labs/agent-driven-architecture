// The DECLARATION the census derives from — identical in shape to the live contract,
// so the derivation cannot be satisfied by a fixture idiom the tree migrated away
// from (the C7 rot). The superclass CALL is what classifies the leaf.

package adr.contract

import adr.spine.pure.EffectClass
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

sealed class EscalationEffect(
    override val at: Timestamp,
    effectClass: EffectClass,
) : Effect(at, effectClass) {
    data class PageOncall(
        override val at: Timestamp,
        val ticket: TicketId,
    ) : EscalationEffect(at, EffectClass.Irreversible)
}
