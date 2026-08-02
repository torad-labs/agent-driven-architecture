// VIOLATION 4 of 4 — THE FULLY-QUALIFIED SPELLING, and the NESTED-CLASS IMPORT.
// Two names for one leaf in one file: the path with no import at all, and the bare
// spelling a nested-class import puts in scope.

package adr.app

import adr.contract.EscalationEffect.PageOncall
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

class Root {
    fun qualified(now: Timestamp, ticket: TicketId) =
        adr.contract.EscalationEffect.PageOncall(now, ticket)

    fun bare(now: Timestamp, ticket: TicketId) = PageOncall(now, ticket)
}
