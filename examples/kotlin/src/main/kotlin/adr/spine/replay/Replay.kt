// ── spine/replay/replay — a LIVE run against its REPLAY (F5) ───────────────
// The shipped harness folded the same in-memory array TWICE through a pure
// function and asserted equality — true by definition, and measured to pass even
// with seam 07's own named violation injected (a tool reading a mutable global and
// performing a side effect). That double-fold is DELETED. It caught nothing, and
// the thing it claimed to catch is structurally impossible for it to see.
//
// What replay actually buys (A2): determinism over a RECORDED TIMELINE —
// forensics, audit, production-traces-as-fixtures. It is NOT behavioural
// reproducibility: re-running the model is not deterministic, and inputs conflated
// away were never recorded. What IS guaranteed is that the run that WAS recorded
// re-derives exactly, bit for bit, from its own committed bytes.
//
// A live-source tool is caught by a CHECK (gate check C8), not by this harness.

package adr.spine.replay

import adr.spine.ports.Sink
import adr.spine.pure.ContextFixture
import adr.spine.pure.EffectKey
import adr.spine.pure.Fold
import adr.spine.pure.KeyedEffect
import adr.spine.pure.PerformMode
import adr.spine.pure.ProjectContext
import adr.spine.pure.StepIndex
import adr.spine.pure.StepRecord
import adr.spine.pure.render

data class RefoldOutcome<S>(val state: S, val effects: List<KeyedEffect>)

/**
 * Re-fold ONLY the committed bytes. Every effect is re-keyed from the record's own
 * offset, so the re-derived sequence is comparable to the live one key for key —
 * including every timestamp, which is why `now` had to ride the record (F8).
 */
fun <S> refold(initial: S, records: List<StepRecord>, fold: Fold<S>): RefoldOutcome<S> {
    var state = initial
    val effects = mutableListOf<KeyedEffect>()
    records.forEachIndexed { step, record ->
        val (next, produced) = fold(state, record.results, record.now, record.sig)
        state = next
        produced.forEachIndexed { i, effect ->
            effects += KeyedEffect(EffectKey(StepIndex(step), i), effect)
        }
    }
    return RefoldOutcome(state, effects)
}

/**
 * Drive the perform seam from a recorded timeline. In REPLAY the sink collects the
 * descriptor and touches nothing; in RECOVERY it re-drives un-acknowledged effects
 * and dedupes on the key.
 */
fun <S> collectPerform(
    initial: S,
    records: List<StepRecord>,
    sink: Sink,
    mode: PerformMode,
    fold: Fold<S>,
) {
    refold(initial, records, fold).effects.forEach { sink.perform(it, mode) }
}

/**
 * The real harness: assert a LIVE run against its REPLAY.
 *
 * Three assertions, none of them f(x) == f(x):
 *   1. the re-folded state equals the live state;
 *   2. the re-derived effect sequence equals the live one — keys AND timestamps;
 *   3. every step's recorded context digest still matches what projectContext
 *      produces from the state as it was BEFORE that step (F4/§5.3), so a change to
 *      the reasoner's input that silently alters what the model saw fails the
 *      golden trace — without re-running the model.
 */
fun <S> assertReplayFaithful(
    initial: S,
    records: List<StepRecord>,
    liveState: S,
    liveEffects: List<KeyedEffect>,
    fold: Fold<S>,
    projectContext: ProjectContext<S>,
    promptVersion: String,
) {
    var state = initial
    records.forEachIndexed { step, record ->
        val expected = ContextFixture(promptVersion, render(projectContext(state, record.staged)))
        check(record.context == expected) {
            "replay: the context fixture committed at step $step does not match the projection"
        }
        state = fold(state, record.results, record.now, record.sig).first
    }

    val outcome = refold(initial, records, fold)
    check(outcome.state == liveState) { "replay: the re-folded state differs from the live state" }
    check(outcome.effects == liveEffects) {
        "replay: the re-derived effect sequence differs from the live one"
    }
}
