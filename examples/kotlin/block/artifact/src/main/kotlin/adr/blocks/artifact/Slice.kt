// ── blocks/artifact/slice — the work product as a FOLDED SLICE (G16) ───────
// Because the content IS State, it re-folds, it diffs by value, and it is
// crash-recoverable for free. The regression the old shape could not catch — a
// reducer change that truncates a line while leaving everything else identical — now
// fails the golden STATE assertion.

package adr.blocks.artifact

import adr.contract.ArtifactResult.ArtifactLine
import adr.spine.pure.Authority
import adr.spine.pure.Timestamp

// `ArtifactLine` is declared on this block's own sealed transport root, in
// blocks/artifact/Contract.kt: `ArtifactEffect.DeliverArtifact` carries a list of them,
// and Kotlin's sealed rule authors that file inside `:spine` (ADR-001 §3). C2 admits
// the import by name prefix — `ArtifactResult.ArtifactLine` starts with `Artifact`.

sealed class SealStatus {
    data object Draft : SealStatus()

    /** Reversible: a request is just a request. Records WHO ASKED. */
    data class Sealing(val requestedBy: Authority) : SealStatus()

    data class Sealed(val at: Timestamp, val by: Authority) : SealStatus()
}

data class ArtifactSlice(
    val lines: List<ArtifactLine> = emptyList(),
    val seal: SealStatus = SealStatus.Draft,
) {
    // No companion: a companion member has no instance, the same defect as a top-level
    // function. The EMPTY slice is what the primary constructor builds when told
    // nothing — `ArtifactSlice()` — so the shape carries its own starting value.
    fun withLine(line: ArtifactLine): ArtifactSlice = copy(lines = lines + line)

    fun withSeal(next: SealStatus): ArtifactSlice = copy(seal = next)
}
