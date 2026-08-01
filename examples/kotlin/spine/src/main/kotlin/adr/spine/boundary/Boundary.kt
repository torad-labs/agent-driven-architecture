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
//    results were produced in step 3, before the signature existed. G1's
//    two-unreconciled-actor-values problem cannot recur, because there is only one
//    value and it is created after the tool has returned.
//
// AND NOTHING UPSTREAM OF STEP 4 CAN CHOOSE IT EITHER. `by` is a parameter of the
// CHANNEL a caller was handed, never a property of the step it submits, so the value
// fed to `authorityOf` is decided in this file and nowhere else.

package adr.spine.boundary

import adr.spine.pure.Actor
import adr.spine.pure.Admission
import adr.spine.pure.Context
import adr.spine.pure.ContextBounds
import adr.spine.pure.ContextFixture
import adr.spine.pure.DEFAULT_CONTEXT_BOUNDS
import adr.spine.pure.CURRENT_SCHEMA
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
 * G11 outright.
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
    /**
     * THE REASONER'S WINDOW, wired at the root (docs/DECISIONS.md:174), defaulted to
     * the spine's shipped one — the same shape [adr.spine.concurrency.SerialConsumer]
     * already gives its three deadlines.
     *
     * PUBLIC, and held HERE rather than curried into [projectContext], for one reason:
     * ONE value must reach both the digest this seam commits and the projection the
     * tools and the agent loop read. A root that curried the bound into the dispatcher
     * and declared another one here would have two, and nothing would notice.
     */
    val contextBounds: ContextBounds = DEFAULT_CONTEXT_BOUNDS,
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

    /**
     * Derived from the SAME registry the gate reads (docs/DECISIONS.md:85), so admission
     * and the gate cannot disagree about which verbs are irreversible. The replay
     * harness is handed one built from that same registry, which is what makes
     * live == REPLAY == RECOVERY a property of the data rather than of two tables.
     */
    private val admission = Admission(registry)

    /** The bounded projection the reasoner sees right now — the loop stages it per step. */
    fun context(staged: List<StagedInput> = emptyList()): Context =
        projectContext(state, staged, contextBounds)

    /**
     * THE THREE CHANNELS, AND THEY ARE THE WHOLE PUBLIC STEP SURFACE. There is no
     * `onStepFinish` any more, because one entry taking the Actor as an argument is
     * one entry that lets its caller pick a principal — and `authorityOf` is asked
     * about exactly that value.
     *
     * Each is handed to one owner at wiring, and the Actor it stamps is fixed HERE,
     * in the only folder allowed to mint a `Signature` at all. §5.3's "decided by
     * where it entered, never by what it asks for" stops being a convention and
     * becomes the shape of a type: the payload has no property to ask with.
     */
    val human: Submit = Submit { commit(Actor.Human, it) }
    val agent: Submit = Submit { commit(Actor.Agent, it) }
    val spine: Submit = Submit { commit(Actor.Spine, it) }

    /**
     * PRIVATE, and that is the closure. `by` is a parameter of the CHANNEL and never
     * of the payload, so the only values it takes are the three above.
     */
    private fun commit(by: Actor, step: FinishedStep) {
        // 1 — the ONLY clock read in the system (G9).
        val now = clock.now()

        // 2 — the THIRD pure projection (G15). The tools see exactly what the reasoner saw.
        val ctx = Ctx(state, projectContext(state, step.staged, contextBounds))

        // 3 — the ONE closed name→ToolResult map (G1), before anything is stamped.
        val results = step.actions.map { actions.resolve(it, ctx) }

        // 4 — stamp WHO acted and resolve UNDER WHOSE PERMISSION, together, once (G1, G6).
        //     `by` came from the CHANNEL, not from `step`, so no caller decides which
        //     principal the authority resolver is asked about.
        val sig = Signature(by = by, authority = authority.authorityOf(by, session))

        // 5 — the gate, PRE-FOLD, keyed on the authority (G1/G6).
        val gated = results.map { irreversibility.check(it, sig, state) }

        // 6 — the pure decision. The only decider in the system.
        val (next, effects) = fold(state, gated, now, sig)

        // 7 — COMMIT the step as a unit (14.6). `results` is POST-GATE: exactly what was
        //     folded. `actions` is what was ASKED. 6.8: EVERY verb signs, presentation included.
        //     14.7: the envelope is stamped HERE, at the one site that mints a record,
        //     so no committed step can be missing its version.
        val index = bus.append(
            StepRecord(
                schemaVersion = CURRENT_SCHEMA,
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

        // 9 — ADMIT, then perform with the key derived from the COMMITTED index (G9).
        //     This line literally cannot run before step 7, because `index` does not
        //     exist until then. The list handed to `perform` is FLAT: admission
        //     SUBSTITUTES a diagnostic in place rather than dropping, so the
        //     (step, index) key derivation is untouched.
        admission.admit(effects).forEachIndexed { i, effect ->
            sink.perform(KeyedEffect(EffectKey(index, i), effect), PerformMode.LIVE)
        }
    }
}
