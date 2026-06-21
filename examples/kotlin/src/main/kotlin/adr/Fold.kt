// ── The fold: the Use-Case Interactor (seam 01) ─────────────────────────────
// Pure. A function of (state, results, now). Returns (newState, effects).
// It RETURNS effect descriptors; it never performs them. `now` is injected, so
// the same recorded input always re-folds to the same output (replay).

package adr

data class RecordedStep(val results: List<ToolResult>, val now: Long)

object Reducer {

    fun fold(state: State, results: List<ToolResult>, now: Long): Pair<State, List<Effect>> {
        var s = state
        val fx = mutableListOf<Effect>()
        for (r in results) {
            when (r) {
                is ToolResult.PrioritySet -> {
                    s = s.withPriority(r.ticket, r.level)
                    fx += Effect.Log(what = "priority", ticket = r.ticket, level = r.level, at = now)
                }
                is ToolResult.EscalationRequested ->
                    // a request is reversible — no irreversible effect fires
                    s = s.withStatus(r.ticket, TicketStatus.Escalating(r.by))
                is ToolResult.EscalationConfirmed ->
                    // THE GATE: the irreversible page fires only for a separate authority.
                    // The actor was minted at the boundary, so an agent-issued confirm
                    // carries `Agent` and cannot reach PageOncall.
                    if (r.by == Actor.Human) {
                        s = s.withStatus(r.ticket, TicketStatus.Escalated)
                        fx += Effect.PageOncall(ticket = r.ticket, at = now)
                    } else {
                        fx += Effect.Diag(note = "denied: agent self-confirm")
                    }
                is ToolResult.Focused ->
                    // a UI tool folds into UI state only — no domain effect
                    s = s.withFocus(r.ticket)
            }
        }
        // exhaustiveness: `when` over the sealed ToolResult proves every variant
        // is handled at compile time (G12) — no runtime default arm needed.
        return s to fx.toList()
    }

    // Fold a recorded timeline step by step. `foldAll` is just `fold` iterated.
    fun foldAll(initial: State, recorded: List<RecordedStep>): Pair<State, List<Effect>> {
        var s = initial
        val all = mutableListOf<Effect>()
        for (step in recorded) {
            val (next, fx) = fold(s, step.results, step.now)
            s = next
            all += fx
        }
        return s to all.toList()
    }
}
