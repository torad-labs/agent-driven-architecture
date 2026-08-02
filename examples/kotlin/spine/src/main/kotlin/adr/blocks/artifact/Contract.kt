// ── blocks/artifact/contract — the work product's transport (G16) ──────────
// The artifact used to be built by PERFORMED EFFECTS — which replay stubs — so 2.2's
// "the folded, replayable result of the session" was false, and a reducer change
// that corrupted artifact content while leaving State byte-identical passed every
// check on offer.
//
// Here the artifact IS State: one line per fold arm. Delivery is ONE irreversible
// effect at seal time, gated by G6 exactly as 14.3 says session-end is.

package adr.contract

import adr.spine.pure.Actor
import adr.spine.pure.CommandId
import adr.spine.pure.EffectClass
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName

/**
 * A sealed CLASS extending the sealed CLASS ToolResult: `tool` is passed up the chain,
 * so every variant carries it by construction rather than by re-implementing it.
 */
sealed class ArtifactResult(override val tool: ToolName) : ToolResult(tool) {

    /**
     * FORCED INTO THE TRANSPORT ROOT by Kotlin's sealed rule, not by preference.
     *
     * Every variant of a sealed hierarchy must live in one package AND one MODULE, so
     * this block's transport is authored inside `:spine` (ADR-001 §3) — the compiler
     * says "Extending sealed classes or interfaces from a different module is
     * prohibited". A payload type the transport NAMES therefore cannot stay behind in
     * the block module: `:spine` may not depend on a block at all.
     *
     * It is nested on the block's own sealed root rather than promoted to
     * `adr.spine.pure`, because the kernel is a VENDORABLE tier (gate check C15) and
     * an artifact line is block domain vocabulary — putting it there would be a
     * worse violation of "the spine tier names nothing in your feature code" than
     * anything the DAG fixes. Nested, C2 admits it by the existing name-prefix rule
     * (`ArtifactResult.ArtifactLine` starts with `Artifact`), C15 never sees it, `adr.spine.pure`
     * gains nothing, and no new file and no new package enter the kernel.
     *
     * `by` is the stamped Actor, copied in by the ARM from `sig` — never by the tool.
     * Consumers import the nested name, so blocks/artifact still reads `ArtifactLine`.
     */
    data class ArtifactLine(val at: Timestamp, val by: Actor, val text: String)

    data class RecordFinding(
        override val tool: ToolName,
        val text: String,
    ) : ArtifactResult(tool)

    data class RequestSeal(override val tool: ToolName) : ArtifactResult(tool)

    data class ConfirmSeal(override val tool: ToolName) : ArtifactResult(tool)
}

/**
 * A sealed CLASS extending the sealed CLASS Command: tool/sig/id pass up the chain and
 * every variant carries authorship, permission and identity by construction (G12).
 */
sealed class ArtifactCommand(
    override val tool: ToolName,
    override val sig: Signature,
    override val id: CommandId,
) : Command(tool, sig, id) {
    data class RecordFinding(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val text: String,
    ) : ArtifactCommand(tool, sig, id)

    data class RequestSeal(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
    ) : ArtifactCommand(tool, sig, id)

    data class ConfirmSeal(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
    ) : ArtifactCommand(tool, sig, id)
}

sealed class ArtifactEffect(
    override val at: Timestamp,
    effectClass: EffectClass,
) : Effect(at, effectClass) {
    /** IRREVERSIBLE, and it fires exactly ONCE, at seal time — never once per line: the
     *  work product leaves the system. Its verb `confirmSeal` is the registry's other
     *  Irreversible row — the same fact stated at the other end of the same step. */
    data class DeliverArtifact(
        override val at: Timestamp,
        val lines: List<ArtifactResult.ArtifactLine>,
    ) : ArtifactEffect(at, EffectClass.Irreversible)
}
