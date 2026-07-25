// ── BLOCK-TEST for gate check C14 (G3) ────────────────────────────────────
// The loop with policy in it. Retry counts, skip conditions and swallowed
// exceptions are decisions, and a decision that lives in the loop is a decision
// that never reaches the fold, never signs and never replays.
//
// EXPECTED: detekt.CyclomaticComplexMethod fires (threshold 2 over spine/agent).

package fixture.violating.spine.agent

class Loop(private val submit: (String) -> Unit) {
    fun run(calls: List<String>) {
        for (call in calls) {
            if (call.isBlank()) {
                continue
            }
            try {
                submit(call)
            } catch (e: IllegalStateException) {
                submit("retry:$call:${e.message}")
            }
        }
    }
}
