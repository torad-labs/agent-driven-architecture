// ── blocks/artifact/register — THE ONE PUBLIC SYMBOL (G11) ─────────────
// A CONSTRUCTED class, like every other block. It is the first of the three blocks
// that do NOT match triage's role set exactly, and the difference is visible right
// here: there is no `contextLines`, because the artifact contributes a COUNT to the
// reasoner's Context and never its lines (§5.2).
//
// That is why `lineCount` is an ordinary member and not an interface method: `Block`
// pins only what all six blocks genuinely share, so a block with a different
// contribution simply declares it, and the root reads it by name.

package adr.blocks.artifact

import adr.contract.ArtifactResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Block
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Lens
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class ArtifactBlock : Block<ArtifactSlice, ArtifactResult, ArtifactView> {

    private val armImpl = ArtifactArm()
    private val projection = ArtifactProjection()

    fun <S> register(lens: Lens<S, ArtifactSlice>): BlockRegistration<S> =
        BlockRegistration(block = "artifact", verbs = ArtifactTools(lens).verbs())

    override fun arm(
        slice: ArtifactSlice,
        result: ArtifactResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<ArtifactSlice> = armImpl.arm(slice, result, now, sig)

    override fun view(slice: ArtifactSlice): ArtifactView = projection.view(slice)

    /** This block's context contribution: a COUNT, where the other five give lines. */
    fun lineCount(slice: ArtifactSlice): Int = projection.lineCount(slice)
}
