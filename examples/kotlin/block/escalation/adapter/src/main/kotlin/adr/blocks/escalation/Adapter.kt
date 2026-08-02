// ── blocks/escalation/adapter — the ONLY file in this block that may hold a client ─
// G13 in one file name: if you want to know what this block can touch in the world,
// this is the only place to look. It is bound at the single composition root (G7).

package adr.blocks.escalation

import adr.spine.pure.Emit
import adr.spine.pure.TicketId

/**
 * The rim of the block. `send` stands in for the pager SDK — a real one would be a
 * client handle held here and nowhere else.
 */
class LivePager(
    private val endpoint: String,
    private val send: Emit<String>,
) : OncallPort {
    override fun page(ticket: TicketId) {
        send("POST $endpoint {\"ticket\":\"${ticket.value}\"}")
    }
}
