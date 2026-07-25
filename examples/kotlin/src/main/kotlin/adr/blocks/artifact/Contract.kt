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

sealed interface ArtifactResult : ToolResult {
    data class RecordFinding(
        override val tool: ToolName,
        val text: String,
    ) : ArtifactResult

    data class RequestSeal(override val tool: ToolName) : ArtifactResult

    data class ConfirmSeal(override val tool: ToolName) : ArtifactResult
}

sealed interface ArtifactCommand : Command {
    data class RecordFinding(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val text: String,
    ) : ArtifactCommand

    data class RequestSeal(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
    ) : ArtifactCommand

    data class ConfirmSeal(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
    ) : ArtifactCommand
}

sealed interface ArtifactEffect : Effect {
    /** IRREVERSIBLE, and it fires exactly ONCE, at seal time — never once per line. */
    data class DeliverArtifact(
        override val at: Timestamp,
        val lines: List<ArtifactLine>,
    ) : ArtifactEffect
}
