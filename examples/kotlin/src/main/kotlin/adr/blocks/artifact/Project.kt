// ── blocks/artifact/project — TWO pure projections of the SAME slice ───────
// Note what the CONTEXT projection contributes: a COUNT, never the lines (§5.2).
// That is the whole reason a long session cannot inflate the reasoner's input by
// writing more findings.

package adr.blocks.artifact

data class ArtifactView(
    val lines: List<String>,
    val state: String,
    val canSeal: Boolean,
    val sealed: Boolean,
)

fun artifactView(slice: ArtifactSlice): ArtifactView = when (val seal = slice.seal) {
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
fun artifactLineCount(slice: ArtifactSlice): Int = slice.lines.size
