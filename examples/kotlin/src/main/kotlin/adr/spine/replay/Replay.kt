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
//
// TWO CONSTRUCTED HOSTS, no top-level functions:
//
//     Replay(fold).refold(initial, records)                       -> RefoldOutcome
//     Replay(fold).collectPerform(initial, records, sink, mode)
//     ReplayFaithfulness(fold, projectContext, promptVersion)
//         .assertFaithful(initial, records, liveState, liveEffects)
//
// The split is the one spine/boundary/Action.kt already makes: what is CONSTANT for
// one app — the fold, the projection, the prompt version — is constructor-held and
// drops out of every signature; what VARIES per call — which timeline, which sink,
// which mode — stays an argument. A top-level function has no instance: nothing
// builds it, so nothing can stand in for it, so it can only be reached through
// whatever calls it.
//
// `fold` is INJECTED here, which is the opposite of the choice Boundary.kt makes for
// its gate, and the difference is structural rather than stylistic. The spine is
// generic in S precisely because it cannot know the app's fold, and replay is
// READ-ONLY over an already-committed bus: it mints no ToolResult and appends
// nothing, so C7's single-production-site guarantee is untouched by letting a caller
// bind it. A bindable gate would be a bypassable gate; a bindable re-fold bypasses
// nothing, because there is no authority on this path to bypass.
//
// ReplayFaithfulness BUILDS its own re-fold instead of accepting one, for the
// inverse reason: its digest walk and its re-fold must provably follow the SAME
// fold. Hand the two halves different folds and the assertion compares two
// different runs and passes — the vacuous harness this file exists to end.

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
import adr.spine.pure.ContextRenderer

data class RefoldOutcome<S>(val state: S, val effects: List<KeyedEffect>)

/**
 * Re-derivation over ONE app's fold. The fold is identical on every call inside an
 * app, so it is constructor state and both members lose it from their signatures;
 * the timeline, the sink and the mode vary per call and stay arguments.
 */
class Replay<S>(private val fold: Fold<S>) {

    /**
     * Re-fold ONLY the committed bytes. Every effect is re-keyed from the record's own
     * offset, so the re-derived sequence is comparable to the live one key for key —
     * including every timestamp, which is why `now` had to ride the record (F8).
     */
    fun refold(initial: S, records: List<StepRecord>): RefoldOutcome<S> {
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
    fun collectPerform(initial: S, records: List<StepRecord>, sink: Sink, mode: PerformMode) {
        refold(initial, records).effects.forEach { sink.perform(it, mode) }
    }
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
 *
 * The three values it holds are exactly the three the Boundary holds (Boundary.kt:56-58),
 * because assertion 3 has to re-derive the fixture the boundary committed.
 */
class ReplayFaithfulness<S>(
    private val fold: Fold<S>,
    private val projectContext: ProjectContext<S>,
    private val promptVersion: String,
) {

    /**
     * Built here, never injected. Assertions 1–2 re-fold and assertion 3 walks the
     * same records step by step; a harness that let those two halves be handed
     * different folds would compare two different runs and pass.
     */
    private val replay = Replay(fold)

    fun assertFaithful(
        initial: S,
        records: List<StepRecord>,
        liveState: S,
        liveEffects: List<KeyedEffect>,
    ) {
        var state = initial
        records.forEachIndexed { step, record ->
            val expected = ContextFixture(promptVersion, ContextRenderer().render(projectContext(state, record.staged)))
            check(record.context == expected) {
                "replay: the context fixture committed at step $step does not match the projection"
            }
            state = fold(state, record.results, record.now, record.sig).first
        }

        val outcome = replay.refold(initial, records)
        check(outcome.state == liveState) { "replay: the re-folded state differs from the live state" }
        check(outcome.effects == liveEffects) {
            "replay: the re-derived effect sequence differs from the live one"
        }
    }
}
