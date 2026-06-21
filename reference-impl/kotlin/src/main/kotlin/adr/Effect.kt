// ── Effect descriptors (seam 01) ────────────────────────────────────────────
// Plain data. The fold RETURNS these; only the boundary PERFORMS them.

package adr

sealed interface Effect {
    data class Log(val what: String, val ticket: String, val level: Priority, val at: Long) : Effect
    data class PageOncall(val ticket: String, val at: Long) : Effect
    data class Diag(val note: String) : Effect
}
