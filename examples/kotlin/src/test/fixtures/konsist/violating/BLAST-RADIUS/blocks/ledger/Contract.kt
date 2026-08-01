// The DECLARATION the blast-radius census derives from — the live contract's shape,
// so the derivation cannot be satisfied by a fixture idiom the tree migrated away from
// (the C7 rot). TWO verbs: two Result cases and their two Command twins.

package adr.contract

import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.SourceName
import adr.spine.pure.ToolName

sealed class LedgerResult(
    override val tool: ToolName,
    open val source: SourceName,
) : ToolResult(tool) {
    data class NoteEntry(
        override val tool: ToolName,
        override val source: SourceName,
        val line: String,
    ) : LedgerResult(tool, source)

    data class NoteReversal(
        override val tool: ToolName,
        override val source: SourceName,
        val entry: String,
    ) : LedgerResult(tool, source)
}

sealed class LedgerCommand(
    override val tool: ToolName,
    override val sig: Signature,
    override val id: CommandId,
) : Command(tool, sig, id) {
    data class NoteEntry(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val source: SourceName,
        val line: String,
    ) : LedgerCommand(tool, sig, id)

    data class NoteReversal(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val source: SourceName,
        val entry: String,
    ) : LedgerCommand(tool, sig, id)
}
