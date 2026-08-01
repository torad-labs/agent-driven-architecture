// ── spine/pure/spine-slice — the spine's own slice, and the fold-arm contract ─
// Every block owns a slice of the one folded State; so does the spine. This one
// holds the session-global RunStatus and the per-item Notice list.
//
// ArmOut is the shape EVERY fold arm returns (§7). Three rules, mechanical, no
// exceptions:
//   1. every arm reads current state before it decides;
//   2. every effect push lives inside the success branch;
//   3. a rejection folds a per-item Notice, never RunStatus, and never a mutation.

package adr.spine.pure

import adr.contract.Effect
import adr.contract.ToolResult

data class SpineSlice(
    val run: RunStatus = RunStatus.Idle,
    val notices: List<Notice> = emptyList(),
) {
    // No companion: a companion member has no instance, which is the same defect as a
    // top-level function. The EMPTY slice is now what the primary constructor builds
    // when told nothing — `SpineSlice()` — so the shape carries its own starting value and
    // nothing extra has to exist to hand it over.
    fun withNotices(more: List<Notice>): SpineSlice =
        if (more.isEmpty()) this else copy(notices = notices + more)
}

/** What one fold arm returns: the new slice, the effects it earned, the notices it left. */
data class ArmOut<S>(
    val slice: S,
    val effects: List<Effect> = emptyList(),
    val notices: List<Notice> = emptyList(),
)

// ── ADMISSION — one pure rule, applied wherever effects are DERIVED ────────
// docs/DECISIONS.md:85 puts the refusal at the boundary, "before perform". Written
// only there it would be a property of the LIVE path, and a re-fold derives its own
// effect sequence from the committed results — so the boundary would refuse and the
// RECOVERY re-drive would page on-call anyway. The rule is therefore PURE, lives
// here beside the fold contract it reads, and is applied at every site that turns
// committed results into effects: boundary step 9, `Replay.refold`, and
// `Replay.refoldFrom`'s own inline loop. Live == REPLAY == RECOVERY by construction.
//
// CALLER-THREADED AND UNREFUSED, said plainly: [Admission] is a constructor argument,
// not a seam that can refuse a mismatch the way [SnapshotTag] refuses a wrong reducer.
// docs/DECISIONS.md:85 asks for ONE RULE applied everywhere, not a refusing table; a
// refuse-on-mismatch seam for the table is a separate decision.

/** What an effect costs if it happens twice, or happens wrongly. */
enum class EffectClass {
    /** A log line, a re-render, a delivery a reader can ignore. */
    Routine,

    /** The on-call page, the sealed artifact — refused before perform, not apologised for. */
    Irreversible,
}

/** The one word the system uses for an irreversible effect nothing earned. */
const val REFUSED_EFFECT = "refused before perform — no surviving irreversible verb earned effect"

/**
 * ONE EFFECT AND THE COMMITTED RESULT IT CAME FROM — and the rule that judges the
 * pair, on the one type that holds both halves.
 *
 * NOT a data class, and both halves are PRIVATE, for [Signature]'s reason one seam
 * over: a data class ships `copy()` and `componentN()`, so `val (_, e) = attributed`
 * would be a second spelling of a read; private constructor properties mean there is
 * no read at all. `attributed.emitted`, `with(a) { emitted }` and a destructuring
 * declaration are all COMPILE errors rather than lint messages. Gate check C16 is
 * therefore a TRIPWIRE — it fires the instant a future author widens the visibility
 * back out — and GateTest's ANCHORS pin asserts the visibility itself.
 *
 * THE RULE. A `Routine` effect always passes. An `Irreversible` effect passes only
 * when the result it came from is a SURVIVING result of a verb the registry
 * classified Irreversible — the same classification 14.3's default-deny is built on,
 * read from the same registry the gate read.
 *
 * The survival clause is load-bearing and has its own probe: the gate's own `Refused`
 * verdict is a COMMITTED result, and an arm that emitted an irreversible effect off
 * the back of one would be performing exactly what the gate denied
 * (src/test/kotlin/adr/spine/AdmissionTest.kt).
 *
 * SUBSTITUTE, NEVER DROP: a refused effect becomes a [Effect.Diag] at its own
 * position, so the list length is preserved and KeyedEffect's (step, index) key
 * derivation is untouched (G9).
 */
class Attributed(private val from: ToolResult, private val emitted: Effect) {

    fun admit(licences: Set<ToolName>): Effect =
        if (emitted.effectClass == EffectClass.Routine || earns(licences)) {
            emitted
        } else {
            Effect.Diag(
                emitted.at,
                "$REFUSED_EFFECT `${emitted::class.simpleName}` from `${from.tool.value}`",
            )
        }

    /** Did the result THIS effect came from earn an irreversible act? */
    private fun earns(licences: Set<ToolName>): Boolean =
        from !is ToolResult.Unhandled && from !is ToolResult.Refused && from.tool in licences
}

/**
 * THE RULE'S HOST, holding the licences it checks against.
 *
 * The licence set is DERIVED from the registry the gate already read, so admission
 * and the gate cannot disagree about which verbs are irreversible.
 *
 * PER EFFECT, NOT PER STEP: a step is a list of results and its effects are one flat
 * list, so a licence granted to the STEP would let a Reversible verb's arm emit an
 * irreversible effect for an unrelated ticket and ride out on the confirm standing
 * beside it. The licence checked is that of the result THIS effect came from.
 */
class Admission(registry: Map<ToolName, Verb<*, *, *>>) {

    private val licences: Set<ToolName> =
        registry.values.filterIsInstance<Verb.Irreversible<*, *, *>>().map { it.name }.toSet()

    fun admit(produced: List<Attributed>): List<Effect> = produced.map { it.admit(licences) }
}

/** The pure decision the boundary injects into itself: (state, results, now, sig) -> (state, attributed effects).
 *
 *  ATTRIBUTED, not bare: an [Attributed] is not an [Effect], and KeyedEffect takes only
 *  an [Effect], so the sole route from what the fold returned to what the sink performs
 *  runs through [Admission.admit]. */
fun interface Fold<S> {
    /** The pure decision the boundary injects into itself. The ONLY decider in the system. */
    operator fun invoke(
        state: S,
        results: List<ToolResult>,
        now: Timestamp,
        sig: Signature,
    ): Pair<S, List<Attributed>>
}

/**
 * The THIRD pure projection (G15): committed State + this step's ORDERED staged
 * inputs -> Context. Plural because 5.4 already specifies plural off-bus inputs
 * "in their staging order, keyed to the consuming step" — a step may consume a
 * perceived event AND a recall from a peer tier.
 */
fun interface ProjectContext<S> {
    /**
     * Committed State + this step's ORDERED staged inputs + the root's window -> Context.
     *
     * THE BOUND IS AN ARGUMENT, not a constant the implementation closes over
     * (docs/DECISIONS.md:174). The boundary hands it the value the root wired and the
     * replay harness can hand it a different one, which is the only way the committed
     * digest can catch a window that moved.
     */
    operator fun invoke(state: S, staged: List<StagedInput>, bounds: ContextBounds): Context
}

/**
 * The spine's OWN two fold arms — the ones every app folds identically (§7), for the
 * two results no block owns: an action that resolved to no verb, and one the gate
 * refused. A constructed type, so an app can fold them in a test without an app.
 */
class SpineArms {

    /** The arm for an unresolvable action. */
    fun unhandled(slice: SpineSlice, r: ToolResult.Unhandled, now: Timestamp): ArmOut<SpineSlice> =
        ArmOut(
            slice = slice,
            effects = listOf(Effect.Diag(now, r.note)),
            notices = listOf(Notice.Rejected(now, r.tool, r.note)),
        )

    /** The arm for a gate refusal. */
    fun refused(slice: SpineSlice, r: ToolResult.Refused, now: Timestamp): ArmOut<SpineSlice> =
        ArmOut(
            slice = slice,
            effects = listOf(Effect.Diag(now, r.reason)),
            notices = listOf(Notice.Refused(now, r.tool, r.reason)),
        )
}
