// Support for the C7 ALLOW-test: the same contract, so the derived variant list
// is identical and the rule is genuinely being exercised, not merely absent.
package adr.contract

import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

sealed interface TriageResult : ToolResult {
    data class SetPriority(
        override val tool: ToolName,
        val ticket: TicketId,
        val level: String,
    ) : TriageResult
}
