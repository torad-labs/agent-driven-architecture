// ── blocks/artifact/register — THE ONE PUBLIC SYMBOL (I7, L1) ──────────────

package adr.blocks.artifact

import adr.contract.ArtifactResult
import adr.spine.pure.ArmOut
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

object Artifact {
    val initial: ArtifactSlice get() = ArtifactSlice.empty

    fun <S> register(lens: (S) -> ArtifactSlice): BlockRegistration<S> =
        BlockRegistration(block = "artifact", verbs = artifactVerbs(lens))

    fun arm(
        slice: ArtifactSlice,
        result: ArtifactResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<ArtifactSlice> = artifactArm(slice, result, now, sig)

    fun view(slice: ArtifactSlice): ArtifactView = artifactView(slice)

    fun lineCount(slice: ArtifactSlice): Int = artifactLineCount(slice)
}
