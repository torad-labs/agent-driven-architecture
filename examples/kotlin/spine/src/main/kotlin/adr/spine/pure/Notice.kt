// ── spine/pure/notice — PER-ITEM failure, never session-global (12.4) ──────
// The parent declares at, tool and reason ONCE (G12).
//
// A Notice is what a refused or invalid single action leaves behind. It is NOT
// RunStatus: the review's measured (12.4) bug was one bad ticket leaving the banner "degraded:
// ..." for the rest of the session, because a per-item rejection hijacked the
// session-global status. Two types make that mistake unwritable rather than
// something an author has to remember not to do.

package adr.spine.pure

sealed class Notice(
    open val at: Timestamp,
    open val tool: ToolName,
    open val reason: String,
) {

    /** A fold ARM refused the transition: invalid against the current state (12.4). */
    data class Rejected(
        override val at: Timestamp,
        override val tool: ToolName,
        override val reason: String,
    ) : Notice(at, tool, reason)

    /** The BOUNDARY gate refused the action: not permitted (G1/G6). */
    data class Refused(
        override val at: Timestamp,
        override val tool: ToolName,
        override val reason: String,
    ) : Notice(at, tool, reason)
}
