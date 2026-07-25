// ── ALLOW-TEST for gate check C14 (G3) ────────────────────────────────────
// The loop as a DECLARATION: it binds a tool surface and forwards what the runtime
// finished. There is no branch to hide a decision in, so every decision is forced
// down into the fold, where it signs and replays.
//
// This is idiomatic code, not code contorted to please a rule — which is the
// property an allow-test exists to prove.
//
// EXPECTED: no findings.

package fixture.compliant.spine.agent

data class Action(val tool: String, val input: String)

class Loop(
    private val tools: List<String>,
    private val submit: (List<Action>) -> Unit,
) {
    fun declareTools(): List<String> = tools.map { "tool:$it" }

    fun onStepFinish(calls: List<Action>) = submit(calls)
}
