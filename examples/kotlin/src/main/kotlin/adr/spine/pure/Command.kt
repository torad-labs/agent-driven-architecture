// ── spine/pure/command — the sealed ROOT of the signed record ──────────────
// The parent declares tool, sig and id ONCE, IN ITS CONSTRUCTOR, as `open val`.
// Every variant that will ever exist carries authorship, permission and identity by
// CONSTRUCTION (G12) — not by remembering to implement three interface members.
//
// A sealed CLASS, not a sealed interface, and the difference is the whole transport
// mechanism. An interface can only declare that a property exists; the parent holds
// nothing, so "every Command carries a signature" is a promise each variant keeps
// separately. A sealed class with `open val` in its constructor HOLDS the shared
// state: a variant passes it up, overrides it, and the parent's own members can read
// it. That is what makes this type a transport rather than a marker.
//
// ONE FLAT HIERARCHY — there is no Command.Surface / Command.Domain split. A
// presentation verb and a domain verb are peers BY CONSTRUCTION: there is no type
// to branch on, so there cannot be two tool mechanics (6.8). 6.8's "a UI tool folds,
// does not sign" carve-out is deleted from the tree, the types, the maps and the
// numbers.
//
// Note the variants declare `sig`, not `by: Actor` — the stamp travels as one
// value, so authorship and permission can never drift apart (G1). `by()` and
// `authority()` are read paths over it, and they are FUNCTIONS rather than derived
// properties: a `val` in a sealed body is shared state that no variant can override,
// which is the shape this file exists to avoid.

package adr.contract

import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.ToolName

sealed class Command(
    /** The verb — the SAME name as its ToolResult (6.8). */
    open val tool: ToolName,
    /** by: Actor + authority: Authority — stamped ONLY at the boundary (G1). */
    open val sig: Signature,
    /** Minted ONLY at the boundary, from the committed sequence (G9). */
    open val id: CommandId,
) {
    /** Read paths, so no consumer has to reach through `sig` by hand. */
    fun by(): Actor = sig.by

    fun authority(): Authority = sig.authority

    /** An unresolvable action is still a decision someone made — so it signs. */
    data class Unhandled(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val note: String,
    ) : Command(tool, sig, id)

    /** A refusal is a decision, and 5.4's discriminator answers yes — so it signs. */
    data class Refused(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val reason: String,
    ) : Command(tool, sig, id)
}
