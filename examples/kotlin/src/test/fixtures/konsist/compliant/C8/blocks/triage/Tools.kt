// ALLOW-TEST C8 — a pure tool: raw input in, a payload out, nothing read and
// nothing written. Where the block genuinely needs the world, it ships a port and
// an adapter INSIDE the block (blocks/<X>/port + blocks/<X>/adapter, the one
// impure file per block) and the root binds it. C8 does not make integrations
// impossible; it makes them visible in the file name.
package adr.blocks.triage

import adr.contract.TriageResult
import adr.spine.pure.RawInput
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName
import adr.spine.pure.text

val SET_PRIORITY = ToolName("setPriority")

fun decode(raw: RawInput): TicketId? = raw.text("ticket")?.let { TicketId(it) }

fun run(ticket: TicketId, level: String): TriageResult =
    TriageResult.SetPriority(SET_PRIORITY, ticket, level)
