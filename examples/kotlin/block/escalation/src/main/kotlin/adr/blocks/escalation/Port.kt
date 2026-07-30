// ── blocks/escalation/port — the block's PRIVATE frozen contract (4.6/G11) ─
// The paging integration ships INSIDE the block, as port + adapter — never inline in
// a tool and never as a shared service the whole app can reach. An interface only.

package adr.blocks.escalation

import adr.spine.pure.TicketId

interface OncallPort {
    fun page(ticket: TicketId)
}
