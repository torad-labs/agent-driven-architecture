// ── blocks/artifact/contract — the work product's transport (F6) ───────────
// The artifact used to be built by PERFORMED EFFECTS — which replay stubs — so 2.2's
// "the folded, replayable result of the session" was false, and a reducer change
// that corrupted artifact content while leaving State byte-identical passed every
// check on offer.
//
// Here the artifact IS State: one line per fold arm. Delivery is ONE irreversible
// effect at seal time, gated by G6 exactly as 14.3 says session-end is.

package adr.contract

import adr.blocks.artifact.ArtifactLine
import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName

/**
 * A sealed CLASS extending the sealed CLASS ToolResult: `tool` is passed up the chain,
 * so every variant carries it by construction rather than by re-implementing it.
 */
sealed class ArtifactResult(override val tool: ToolName) : ToolResult(tool) {
    data class RecordFinding(
        override val tool: ToolName,
        val text: String,
    ) : ArtifactResult(tool)

    data class RequestSeal(override val tool: ToolName) : ArtifactResult(tool)

    data class ConfirmSeal(override val tool: ToolName) : ArtifactResult(tool)
}

/**
 * A sealed CLASS extending the sealed CLASS Command: tool/sig/id pass up the chain and
 * every variant carries authorship, permission and identity by construction (L3).
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

sealed class ArtifactEffect(override val at: Timestamp) : Effect(at) {
    /** IRREVERSIBLE, and it fires exactly ONCE, at seal time — never once per line. */
    data class DeliverArtifact(
        override val at: Timestamp,
        val lines: List<ArtifactLine>,
    ) : ArtifactEffect(at)
}
