// VIOLATION 2 of 4 — THE ALIASED UNION IMPORT. A name-keyed rule frozen on
// `EscalationEffect.PageOncall` cannot follow `as Ev`; the spellings are resolved
// from THIS FILE'S OWN import list, so the alias is what is matched.

package adr.blocks.inbox

import adr.contract.EscalationEffect as Ev
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp

class Aliased {
    fun page(now: Timestamp, ticket: TicketId) = Ev.PageOncall(now, ticket)
}
