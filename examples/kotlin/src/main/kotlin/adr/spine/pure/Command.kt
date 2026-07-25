// ── spine/pure/command — the sealed ROOT of the signed record ──────────────
// The parent declares tool, sig and id ONCE. Every variant that will ever exist
// carries authorship, permission and identity by construction (L3).
//
// ONE FLAT HIERARCHY — there is no Command.Surface / Command.Domain split. A
// presentation verb and a domain verb are peers BY CONSTRUCTION: there is no type
// to branch on, so there cannot be two tool mechanics (A1). 6.8's "a UI tool folds,
// does not sign" carve-out is deleted from the tree, the types, the maps and the
// numbers.
//
// Note the variants declare `sig`, not `by: Actor` — the stamp travels as one
// value, so authorship and permission can never drift apart (F2).

package adr.contract

import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.ToolName

sealed interface Command {
    /** The verb — the SAME name as its ToolResult (D3). */
    val tool: ToolName

    /** by: Actor + authority: Authority — stamped ONLY at the boundary (G1). */
    val sig: Signature

    /** Minted ONLY at the boundary, from the committed sequence (G9). */
    val id: CommandId

    /** Read paths, so no consumer has to reach through `sig` by hand. */
    val by: Actor get() = sig.by
    val authority: Authority get() = sig.authority

    /** An unresolvable action is still a decision someone made — so it signs. */
    data class Unhandled(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val note: String,
    ) : Command

    /** A refusal is a decision, and 5.4's discriminator answers yes — so it signs. */
    data class Refused(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val reason: String,
    ) : Command
}
