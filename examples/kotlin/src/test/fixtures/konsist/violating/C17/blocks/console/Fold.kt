// VIOLATION 3 of 4 — THE TYPEALIAS. The second rebinding no import-keyed rule can
// follow: the leaf is reached under a name this file invents for it.

package adr.blocks.console

import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

typealias Wake = adr.contract.EscalationEffect.PageOncall

class Aliased {
    fun page(now: Timestamp, ticket: TicketId) = Wake(now, ticket)
}
