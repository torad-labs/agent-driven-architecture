// ── spine/boundary/action — the name→ToolResult map (G1) ───────────────────
// The human path into the fold used to be unspecified: fold consumed [ToolResult],
// the surface emitted Action, and NOTHING named the conversion. This file is that
// conversion, and it is the symmetric twin of 6.8's name→Command map — both fed by
// ONE registration.
//
//     ActionResolution(registry).resolve(action, ctx) -> ToolResult   name → ToolResult
//     ActionResolution(registry).sign(result, sig, id) -> Command      name → Command
//
// Both are members of a CONSTRUCTED type, never top-level functions. A top-level
// function has no instance: nothing builds it, so nothing can stand in for it, so it
// can only be reached through whatever calls it. The registry is the state the pair
// shares, so it is constructor-held and drops out of both signatures.
//
// The Boundary builds this itself rather than receiving it injected. That is deliberate:
// an injected resolver would let a test mint ToolResults from a second site, which is
// exactly what C7 below forbids. Instantiated, therefore testable; not bound, therefore
// still the single production site.
//
// Because the open-name guard lives HERE — at the boundary, where the open name
// actually arrives — the fold has no `else` arm at all. It is exhaustive over a
// fully sealed ToolResult including Unhandled and Refused. That is 6.10's "close
// what you own; guard what you do not" put in the right place, and it is what makes
// G12's compile-time edit list total.
//
// This is also the SINGLE PRODUCTION SITE of every ToolResult in the system
// (gate check C7), so a recorded result can never disagree with what was folded.

package adr.spine.boundary

import adr.contract.Command
import adr.contract.ToolResult
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.CommandId
import adr.spine.pure.Ctx
import adr.spine.pure.DECODE_FAILED
import adr.spine.pure.Registry
import adr.spine.pure.Signature
import adr.spine.pure.StagedInput

/**
 * The one channel a finished step travels — the turn's ONLY way into the fold.
 *
 * A NAMED seam, not a raw `(FinishedStep) -> Unit`. It lives here rather than in
 * spine/pure because its payload does, and pure may not import the boundary (C1).
 */
fun interface Submit {
    operator fun invoke(step: FinishedStep)
}

/** One finished step, from either path: the agent loop or the human surface. */
data class FinishedStep(
    val by: Actor,
    /** The ordered off-bus inputs this step consumed (5.4). Empty is the common case. */
    val staged: List<StagedInput>,
    val actions: List<Action>,
)

/**
 * The two closed maps of the boundary, over ONE registry — the symmetric pair named in
 * this file's header. Built by the Boundary from the registry it already holds.
 */
class ActionResolution<S>(private val registry: Registry<S>) {

    /**
     * The ONE closed name→ToolResult map, executed BEFORE the fold.
     *
     * A missing verb and an undecodable input both become a folded, committed
     * ToolResult.Unhandled — never a silent drop (6.5). The shipped Kotlin port's
     * `runCatching { … }.getOrNull()` is gone with it.
     */
    fun resolve(action: Action, ctx: Ctx<S>): ToolResult {
        val verb = registry[action.tool]
            ?: return ToolResult.Unhandled(action.tool, "no registered verb")
        return verb.resolve(action.input, ctx)
            ?: ToolResult.Unhandled(action.tool, DECODE_FAILED)
    }

    /**
     * The name→Command map (6.8), supplied by the same registry. EVERY verb signs —
     * presentation and domain alike (6.8) — and so do the spine's own two results,
     * because a refusal is a decision and 5.4's discriminator answers yes.
     *
     * The two `is` checks are not an open match dressed up as a closed one: the spine
     * structurally CANNOT enumerate block cases (that is G11), and the registry is what
     * closes the set instead. Gate check C13 proves every case in the system has a verb
     * and signs, so the fallback is total by test.
     */
    fun sign(result: ToolResult, sig: Signature, id: CommandId): Command {
        if (result is ToolResult.Unhandled) return Command.Unhandled(result.tool, sig, id, result.note)
        if (result is ToolResult.Refused) return Command.Refused(result.tool, sig, id, result.reason)
        // 6.8 says this cannot be null: a result reaches this verb only because its own
        // `tool` name looked the verb up, and one name means one result case. Gate check
        // C13 re-proves that mapping mechanically for every case in the system. The
        // branch exists because the narrowing is now CHECKED rather than an unchecked
        // cast the compiler was told to ignore — an unreachable failure that says what
        // broke beats a ClassCastException from inside a lambda.
        return registry.getValue(result.tool).signOf(result, sig, id)
            ?: error(
                "C13 violation: ${result.tool.value} produced a result its own verb " +
                    "cannot sign — the registry maps one name to one result case",
            )
    }
}
