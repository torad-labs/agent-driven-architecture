// ── blocks/artifact/fold — the block's ARM ─────────────────────────────────
// One closed match over SealStatus, no else arm. Every line the work product will
// ever contain is written HERE, by a pure function of committed state — which is
// what makes 2.2's "the folded, replayable result of the session" true.

package adr.blocks.artifact

import adr.contract.ArtifactEffect
import adr.contract.ArtifactResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class ArtifactArm {

    fun arm(
        slice: ArtifactSlice,
        result: ArtifactResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<ArtifactSlice> = when (result) {
        is ArtifactResult.RecordFinding -> when (slice.seal) {
            // A sealed artifact is closed: appending to it would change what was delivered.
            is SealStatus.Sealed -> reject(slice, now, result, "the work product is already sealed")
            SealStatus.Draft, is SealStatus.Sealing ->
                if (result.text.isBlank()) {
                    reject(slice, now, result, "a finding cannot be blank")
                } else {
                    ArmOut(slice = slice.withLine(ArtifactLine(now, sig.by, result.text)))
                }
        }

        is ArtifactResult.RequestSeal -> when (slice.seal) {
            SealStatus.Draft ->
                // Reversible: a request emits NO effect.
                ArmOut(slice = slice.withSeal(SealStatus.Sealing(sig.authority)))

            is SealStatus.Sealing -> reject(slice, now, result, "a seal has already been requested")
            is SealStatus.Sealed -> reject(slice, now, result, "the work product is already sealed")
        }

        is ArtifactResult.ConfirmSeal -> when (slice.seal) {
            is SealStatus.Sealing ->
                // RULE 2: the one irreversible effect lives INSIDE the success branch.
                ArmOut(
                    slice = slice.withSeal(SealStatus.Sealed(now, sig.authority)),
                    effects = listOf(ArtifactEffect.DeliverArtifact(now, slice.lines)),
                )

            SealStatus.Draft -> reject(slice, now, result, "no seal has been requested")
            is SealStatus.Sealed -> reject(slice, now, result, "the work product is already sealed")
        }
    }

    private fun reject(
        slice: ArtifactSlice,
        now: Timestamp,
        result: ArtifactResult,
        reason: String,
    ): ArmOut<ArtifactSlice> =
        ArmOut(slice = slice, notices = listOf(Notice.Rejected(now, result.tool, reason)))
}
