// ── blocks/artifact/project — TWO pure projections of the SAME slice ───────
// Note what the CONTEXT projection contributes: a COUNT, never the lines (§5.2).
// That is the whole reason a long session cannot inflate the reasoner's input by
// writing more findings.
//
// THIS BLOCK HAS NO `contextLines` AT ALL, and that measured fact is why the shared
// `Block` interface declares only `arm` and `view`. A four-role interface would have
// forced this block to fake a role it does not have, or forced the root to special-case
// it — the exact per-block special-casing the interface exists to prevent.

package adr.blocks.artifact

data class ArtifactView(
    val lines: List<String>,
    val state: String,
    val canSeal: Boolean,
    val sealed: Boolean,
)

class ArtifactProjection {

    fun view(slice: ArtifactSlice): ArtifactView = when (val seal = slice.seal) {
        SealStatus.Draft -> ArtifactView(
            lines = slice.lines.map { it.text },
            state = "draft",
            canSeal = true,
            sealed = false,
        )

        is SealStatus.Sealing -> ArtifactView(
            lines = slice.lines.map { it.text },
            state = "seal requested by ${seal.requestedBy.id}",
            canSeal = false,
            sealed = false,
        )

        is SealStatus.Sealed -> ArtifactView(
            lines = slice.lines.map { it.text },
            state = "sealed at ${seal.at.value} by ${seal.by.id}",
            canSeal = false,
            sealed = true,
        )
    }

    /** The artifact enters the reasoner's Context by COUNT only — never by content. */
    fun lineCount(slice: ArtifactSlice): Int = slice.lines.size
}
