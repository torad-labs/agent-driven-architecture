// Support for the C7 fixture. The variant lists C7 denies are DERIVED from this
// file, never enumerated in the rule — which is why adding a verb stays four
// appends (§11.1) and never touches the gate.
//
// Sealed CLASSES, exactly like the live contracts. The first version of this
// fixture stayed interface-style when the live tree migrated to sealed classes:
// the derivation went vacuous on the LIVE tree while the fixture kept the
// block-test green — a fixture that stops sharing the tree's shape stops
// standing in for it, which is the silent rot F12 exists to deny.
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
