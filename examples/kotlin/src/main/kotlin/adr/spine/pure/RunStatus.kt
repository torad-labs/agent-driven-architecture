// ── spine/pure/run-status — SESSION-GLOBAL, boundary-owned ─────────────────
// Idle/Working describe the turn; Degraded/Error describe the SESSION: a budget
// exceeded, an append that failed, a turn that threw.
//
// Degraded and Error may be constructed only in spine/boundary/** (gate check C6).
// A block cannot reach the session banner at all — which is the structural fix for
// 12.4, not a convention an author has to keep.

package adr.spine.pure

sealed class RunStatus {
    data object Idle : RunStatus()

    data class Working(val step: Int) : RunStatus()

    data class Degraded(val cause: String) : RunStatus()

    data class Error(val fault: String) : RunStatus()
}
