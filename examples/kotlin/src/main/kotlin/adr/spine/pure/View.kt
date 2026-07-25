// ── spine/pure/view — the ViewModel root the block views compose into ──────
// The Presenter (6.9): every presentational flag is pre-decided here, in a pure
// projection of State. The surface applies flags; it never computes them.
//
// The spine's root carries only what the spine owns — the session banner and the
// per-item notices. It cannot name a block (L1), so the app's own view type is
// what stitches the block views onto this root.

package adr.spine.pure

data class ViewModel(val banner: String, val notices: List<String>)

/**
 * Closed match over RunStatus with NO else arm: adding a status variant breaks the
 * build here, which is the edit list 15.4 promises (G12/F10).
 */
class SpineProjection {

    fun view(slice: SpineSlice): ViewModel = ViewModel(
        banner = when (val run = slice.run) {
            RunStatus.Idle -> "ok"
            is RunStatus.Working -> "working (step ${run.step})"
            is RunStatus.Degraded -> "degraded: ${run.cause}"
            is RunStatus.Error -> "error: ${run.fault}"
        },
        notices = slice.notices.takeLast(MAX_CONTEXT_NOTICES).map { "${it.tool.value}: ${it.reason}" },
    )
}
