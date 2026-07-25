// ── blocks/inbox/contract — the barge-in ledger's transport (12.2/12.4) ────
// Two verbs, both Reversible, both ordinary. THE POINT: a busy-drop is a decision,
// so it SIGNS — exactly like A1's presentation verbs. That is why the drop counter
// needs no new spine machinery and costs the core path zero: the spine's own sealed
// sets do not grow, app/assemble's spine arms do not grow, and an app that never
// wires a consumer never compiles this block.
//
// PACKAGE NOTE (§1.5): package adr.contract, folder blocks/inbox. Gate check C2
// compensates.

package adr.contract

import adr.blocks.inbox.DropReason
import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.SourceName
import adr.spine.pure.ToolName

/**
 * A sealed CLASS extending the sealed CLASS ToolResult: `tool` is passed up the chain,
 * so every variant carries it by construction rather than by re-implementing it.
 */
sealed class InboxResult(
    override val tool: ToolName,
    /**
     * L3 one level down: the block's sub-union declares its own shared property on its
     * own parent — IN THE CONSTRUCTOR, as `open val`, so the parent holds it rather than
     * merely requiring it. Every inbox verb is about a SOURCE, so the arm never has to
     * ask which case it has just to find out which source it is talking about.
     */
    open val source: SourceName,
) : ToolResult(tool) {

    data class NoteDrop(
        override val tool: ToolName,
        override val source: SourceName,
        val reason: DropReason,
        val dropped: Int,
    ) : InboxResult(tool, source)

    data class NoteFault(
        override val tool: ToolName,
        override val source: SourceName,
        val fault: String,
    ) : InboxResult(tool, source)
}

/**
 * A sealed CLASS extending the sealed CLASS Command: tool/sig/id pass up the chain and
 * every variant carries authorship, permission and identity by construction (L3).
 */
sealed class InboxCommand(
    override val tool: ToolName,
    override val sig: Signature,
    override val id: CommandId,
) : Command(tool, sig, id) {
    data class NoteDrop(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val source: SourceName,
        val reason: DropReason,
        val dropped: Int,
    ) : InboxCommand(tool, sig, id)

    data class NoteFault(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val source: SourceName,
        val fault: String,
    ) : InboxCommand(tool, sig, id)
}
