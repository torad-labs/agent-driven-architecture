// ── spine/boundary/boundary — THE ONE IMPURE SEAM (G9) ─────────────────────
// Nine ordered steps. Everything impure in the system happens here or in a block's
// single adapter; nothing else.
//
// Three structural facts fall out, and every implementation must preserve all three:
//
//  * COMMIT STRICTLY PRECEDES PERFORM — not by convention, but because step 9
//    cannot run until step 7 has returned the StepIndex the effect key is built
//    from. 14.6's ordering claim becomes unwritable-wrong.
//
//  * THE GATE RUNS BEFORE THE FOLD AND BEFORE THE COMMIT, so what is committed is
//    already the gate's verdict. A re-fold reproduces it without calling the
//    authorization seam again (G9).
//
//  * NOTHING DOWNSTREAM OF STEP 4 CAN LEARN WHO ACTED EXCEPT THROUGH `sig`. The
//    results were produced in step 3, before the signature existed. F2's
//    two-unreconciled-actor-values problem cannot recur, because there is only one
//    value and it is created after the tool has returned.

package adr.spine.boundary

import adr.spine.pure.Context
import adr.spine.pure.ContextFixture
import adr.spine.pure.Ctx
import adr.spine.pure.EffectKey
import adr.spine.pure.Fold
import adr.spine.pure.KeyedEffect
import adr.spine.pure.PerformMode
import adr.spine.pure.ProjectContext
import adr.spine.pure.Registry
import adr.spine.pure.SessionId
import adr.spine.pure.Signature
import adr.spine.pure.StagedInput
import adr.spine.pure.StepRecord
import adr.spine.pure.ContextRenderer
import adr.spine.ports.AuthorityResolver
import adr.spine.ports.Bus
import adr.spine.ports.Clock
import adr.spine.ports.ConfirmPolicy
import adr.spine.ports.IdSource
import adr.spine.ports.Sink

/**
 * Generic in the app's State type: that is the structural price of "the spine never
 * names a block" (§15 risk 6). The alternative — the spine importing blocks — breaks
 * L1 outright.
 */
class Boundary<S>(
    private val clock: Clock,
    private val ids: IdSource,
    private val bus: Bus,
    private val sink: Sink,
    private val authority: AuthorityResolver,
    private val policy: ConfirmPolicy,
    private val registry: Registry<S>,
    private val fold: Fold<S>,
    private val projectContext: ProjectContext<S>,
    private val promptVersion: String,
    private val session: SessionId,
    initial: S,
) {
    var state: S = initial
        private set

    /**
     * Built here, not injected: the boundary must remain the SINGLE production site of
     * every ToolResult (gate check C7), which an outside-bound resolver would break.
     */
    private val actions = ActionResolution(registry)

    /** Built here for the same reason, and a stronger one: a bindable gate is bypassable. */
    private val irreversibility = IrreversibilityGate(registry, policy)

    /** The bounded projection the reasoner sees right now — the loop stages it per step. */
    fun context(staged: List<StagedInput> = emptyList()): Context = projectContext(state, staged)

    fun onStepFinish(step: FinishedStep) {
        // 1 — the ONLY clock read in the system (G9).
        val now = clock.now()

        // 2 — the THIRD pure projection (F4). The tools see exactly what the reasoner saw.
        val ctx = Ctx(state, projectContext(state, step.staged))

        // 3 — the ONE closed name→ToolResult map (F1), before anything is stamped.
        val results = step.actions.map { actions.resolve(it, ctx) }

        // 4 — stamp WHO acted and resolve UNDER WHOSE PERMISSION, together, once (G1, F3).
        val sig = Signature(by = step.by, authority = authority.authorityOf(step.by, session))

        // 5 — the gate, PRE-FOLD, keyed on the authority (F2/F3/F13).
        val gated = results.map { irreversibility.check(it, sig, state) }

        // 6 — the pure decision. The only decider in the system.
        val (next, effects) = fold(state, gated, now, sig)

        // 7 — COMMIT the step as a unit (14.6/F8). `results` is POST-GATE: exactly what was
        //     folded. `actions` is what was ASKED. A1: EVERY verb signs, presentation included.
        val index = bus.append(
            StepRecord(
                now = now,
                sig = sig,
                staged = step.staged,
                actions = step.actions,
                results = gated,
                commands = gated.map { actions.sign(it, sig, ids.next()) },
                context = ContextFixture(promptVersion, ContextRenderer().render(ctx.context)),
            ),
        )

        // 8 — adopt the derived cache.
        state = next

        // 9 — perform, with the key derived from the COMMITTED index (F7). This line
        //     literally cannot run before step 7, because `index` does not exist until then.
        effects.forEachIndexed { i, effect ->
            sink.perform(KeyedEffect(EffectKey(index, i), effect), PerformMode.LIVE)
        }
    }
}
