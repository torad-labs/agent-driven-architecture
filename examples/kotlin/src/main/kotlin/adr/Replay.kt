// ── Replay: tests are the outermost ring (seam 07) ──────────────────────────
// Because the bus is append-only and the fold is pure, a recorded timeline
// re-folds to a value-identical state every time — with no model, network, or
// clock. Fold it TWICE; assert the two results are identical, then return the
// golden state and effects for the caller to assert against.

package adr

data class ReplayOutcome(
    val state: State,
    val effects: List<Effect>,
)

fun State.replay(recorded: List<RecordedStep>): ReplayOutcome {
    val (a, fa) = Reducer.foldAll(this, recorded)
    val (b, fb) = Reducer.foldAll(this, recorded)
    // determinism: same recorded input → identical state and identical effects.
    // `check` throws IllegalStateException if the two folds ever diverge.
    check(a == b) { "replay diverged: state is not deterministic" }
    check(fa == fb) { "replay diverged: effects are not deterministic" }
    return ReplayOutcome(state = a, effects = fa)
}
