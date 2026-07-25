// ALLOW-TEST C6 — the same rejection, as a PER-ITEM Notice.
// Notice.Rejected says the arm refused this transition against current state;
// Notice.Refused says the boundary gate refused the action. Neither touches the
// banner, so the next good ticket is unaffected — which is the behaviour F9's
// measured bug did not have, expressed as two types rather than as discipline.
package adr.blocks.escalation

import adr.spine.pure.Notice
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName

fun rejectPerItem(now: Timestamp, tool: ToolName, ticket: String): Notice =
    Notice.Rejected(now, tool, "unknown ticket $ticket")
