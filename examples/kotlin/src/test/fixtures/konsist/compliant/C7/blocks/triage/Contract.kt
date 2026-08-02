// Support for the C7 ALLOW-test: the same contract, so the derived variant lists
// are identical and the rule is genuinely being exercised, not merely absent.
// Sealed CLASSES, exactly like the live contracts (see the violating twin for why
// the shape must track the tree's).
package adr.contract

import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

sealed class TriageResult(override val tool: ToolName) : ToolResult(tool) {
    data class SetPriority(
        override val tool: ToolName,
        val ticket: TicketId,
        val level: String,
    ) : TriageResult(tool)
}

sealed class TriageCommand(
    override val tool: ToolName,
    override val sig: Signature,
    override val id: CommandId,
) : Command(tool, sig, id) {
    data class SetPriority(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val ticket: TicketId,
        val level: String,
    ) : TriageCommand(tool, sig, id)
}
