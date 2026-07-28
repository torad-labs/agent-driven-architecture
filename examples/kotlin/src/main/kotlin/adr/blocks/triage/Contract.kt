// ── blocks/triage/contract — the block's transport ─────────────────────────
// Three sealed sub-unions, one per spine root. The block appends cases; it never
// edits the root. The sub-union is also what makes the block's fold arm exhaustive
// on its own, without naming a sibling.
//
// PACKAGE NOTE (G12, in Kotlin): this file sits in blocks/triage/ but declares package
// adr.contract, because Kotlin requires every variant of a sealed hierarchy to live
// in one package. Gate check C2 compensates: a file under blocks/X may import from
// adr.contract only the spine roots or X-prefixed symbols.
//
// HARD CONSTRAINT (G1): no *Result case has an Actor, Authority or Signature
// field. The Command cases carry `sig` — the whole stamp, minted at the boundary.

package adr.contract

import adr.blocks.triage.Priority
import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName

/**
 * A sealed CLASS extending the sealed CLASS ToolResult: `tool` is passed up the chain,
 * so every variant carries it by construction rather than by re-implementing it.
 */
sealed class TriageResult(override val tool: ToolName) : ToolResult(tool) {
    data class SetPriority(
        override val tool: ToolName,
        val ticket: TicketId,
        val level: Priority,
    ) : TriageResult(tool)
}

/**
 * A sealed CLASS extending the sealed CLASS Command: tool/sig/id pass up the chain and
 * every variant carries authorship, permission and identity by construction (G12).
 */
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
        val level: Priority,
    ) : TriageCommand(tool, sig, id)
}

sealed class TriageEffect(override val at: Timestamp) : Effect(at) {
    /** `supersedes` is derived BY THE FOLD from its own current state (4.3) — never by the tool. */
    data class LogDecision(
        override val at: Timestamp,
        val ticket: TicketId,
        val level: Priority,
        val supersedes: Priority?,
    ) : TriageEffect(at)
}
