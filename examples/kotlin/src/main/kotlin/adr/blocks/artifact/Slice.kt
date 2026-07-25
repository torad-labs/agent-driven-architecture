// ── blocks/artifact/slice — the work product as a FOLDED SLICE (F6/G16) ────
// Because the content IS State, it re-folds, it diffs by value, and it is
// crash-recoverable for free. The regression the old shape could not catch — a
// reducer change that truncates a line while leaving everything else identical — now
// fails the golden STATE assertion.

package adr.blocks.artifact

import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.Timestamp

/** `by` is the stamped Actor, copied in by the ARM from `sig` — never by the tool. */
data class ArtifactLine(val at: Timestamp, val by: Actor, val text: String)

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
