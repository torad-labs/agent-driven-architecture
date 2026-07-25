// Support for the C7 fixture. The variant list C7 denies is DERIVED from this
// file, never enumerated in the rule — which is why adding a verb stays four
// appends (§11.1) and never touches the gate.
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
