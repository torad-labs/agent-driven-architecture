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
        /**
         * v2 of this payload (14.7). OPTIONAL in the schema sense — the caller may give
         * none — and it carries NO DEFAULT, so every construction site decides instead
         * of forgetting.
         */
        val reason: String?,
    ) : TriageResult(tool)
}

/**
 * THE v1 PAYLOAD (14.7) — what `setPriority` returned before `reason` existed.
 *
 * A HISTORICAL shape, so it deliberately does NOT extend ToolResult: nothing can fold
 * it, sign it or commit it, and `StepRecord.results` refuses it BY TYPE — nominally,
 * with no discriminant trick required. (The TypeScript port is structural and had to
 * buy the same refusal by giving its v1 payload an `outcome` the current union does
 * not have; the two ports are equal in GUARANTEE, spelled per language.)
 *
 * The only thing that may read one is the upcaster in this block's Tools.kt — which is
 * where a block mints its results (gate check C7), and therefore the only legal home
 * for a function whose OUTPUT is one. It is declared as a sealed union with one case
 * so that C7's name-suffix derivation covers its construction too, exactly as it
 * covers [TriageResult].
 *
 * ABSENCE IS NOT `null`. A v1 record had no field at all; a v2 record with
 * `reason = null` says a caller supplied none. Those are different facts, and
 * conflating them is how an upcaster quietly invents history.
 */
sealed class TriageV1Result {
    data class SetPriority(
        val tool: ToolName,
        val ticket: TicketId,
        val level: Priority,
    ) : TriageV1Result()
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
        /**
         * Carried through from the result, which is what makes the v2 field OBSERVABLE
         * on the replay path: re-folding an upcast v1 log produces a different effect
         * sequence from re-folding a native v2 one. A field no fold reads would make
         * its upcaster untestable by construction.
         */
        val reason: String?,
    ) : TriageEffect(at)
}
