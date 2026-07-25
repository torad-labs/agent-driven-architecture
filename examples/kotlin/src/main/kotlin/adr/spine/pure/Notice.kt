// ── spine/pure/notice — PER-ITEM failure, never session-global (F9) ────────
// The parent declares at, tool and reason ONCE (L3).
//
// A Notice is what a refused or invalid single action leaves behind. It is NOT
// RunStatus: F9's measured bug was one bad ticket leaving the banner "degraded:
// ..." for the rest of the session, because a per-item rejection hijacked the
// session-global status. Two types make that mistake unwritable rather than
// something an author has to remember not to do.

package adr.spine.pure

sealed class Notice(
    open val at: Timestamp,
    open val tool: ToolName,
    open val reason: String,
) {

    /** A fold ARM refused the transition: invalid against the current state (F9). */
    data class Rejected(
        override val at: Timestamp,
        override val tool: ToolName,
        override val reason: String,
    ) : Notice(at, tool, reason)

    /** The BOUNDARY gate refused the action: not permitted (F2/F3). */
    data class Refused(
        override val at: Timestamp,
        override val tool: ToolName,
        override val reason: String,
    ) : Notice(at, tool, reason)
}
