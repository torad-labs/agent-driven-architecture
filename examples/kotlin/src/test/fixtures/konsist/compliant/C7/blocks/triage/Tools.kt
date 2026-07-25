// ALLOW-TEST C7, the other half — the ONE place a block's result is produced.
// One registration, two maps: this file supplies the pure `run` that mints the
// result, and the `sign` entry that turns it into a Command. Both are keyed by the
// same name (D3).
package adr.blocks.triage

import adr.contract.TriageResult
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

val SET_PRIORITY = ToolName("setPriority")

fun run(ticket: TicketId, level: String): TriageResult =
    TriageResult.SetPriority(SET_PRIORITY, ticket, level)
