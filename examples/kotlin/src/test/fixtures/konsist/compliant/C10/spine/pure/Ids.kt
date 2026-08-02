// ALLOW-TEST C10 — constants at the top level, and mutable state ENCAPSULATED.
// The rule is about module-level state, not about mutability: a counter that lives
// inside an object, is constructed at the one composition root and is reachable
// only through a port is exactly how the deterministic adapters are written. This
// is the idiom, unchanged, and the rule leaves it alone.
package adr.spine.pure

const val MAX_CONTEXT_LINES_PER_BLOCK = 8

val defaultSession: String = "session-1"

class SequentialIds(private val prefix: String) {
    private var n = 0

    fun next(): String = "$prefix${++n}"
}
