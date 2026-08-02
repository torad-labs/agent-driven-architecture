// ── spine/pure/keyed-effect — the transport that crosses the perform seam (G9) ─
// 14.6 rests the whole recovery-path safety claim on "the effect's id is its
// idempotency key", and no port ever constructed one: the same confirm applied
// twice paged on-call TWICE.
//
// The key is NOT a field on Effect. Under G12 a shared property belongs on the
// sealed parent — but the fold returns List<Effect>, so a key on Effect is a field
// the fold CAN set, and eventually will. That is exactly what G9 forbids.
// Splitting the parent resolves it cleanly:
//
//     Effect       is the FOLD's transport      and declares `at`
//     KeyedEffect  is the BOUNDARY's transport  and declares `key`
//
// The key is derived from the COMMITTED step index, so it is not even available
// until bus.append() has returned — commit strictly precedes perform, not by
// convention but because step 9 cannot run until step 7 has.
//
// EffectKey and KeyedEffect are constructible only inside spine/boundary/** and
// spine/replay/** (gate check C5). The fold has no field to mint into, and
// perform accepts nothing else.

package adr.spine.pure

import adr.contract.Effect

data class EffectKey(val step: StepIndex, val index: Int)

data class KeyedEffect(val key: EffectKey, val effect: Effect)

enum class PerformMode {
    /** Perform once, for real. The live boundary. */
    LIVE,

    /** Collect the descriptor; touch nothing. spine/replay. */
    REPLAY,

    /** Re-drive un-acknowledged effects; the sink dedupes on KeyedEffect.key (14.6). */
    RECOVERY,
}

// ── THE DISPATCHER — effect performance, registered per block ──────────────
// The type/handler split. The CASES stay sealed in `:spine`: a block appends to
// Effect through its own sub-union in its own contract, and nothing below changes
// that. What a block registers is a HANDLER — a function, not a type — so the closed
// set the compiler checks is untouched while the PERFORMANCE of a case moves into the
// folder that owns it. That is the split the module DAG depends on.
//
// WHERE THE COMPILER STILL DOES THE WORK. A block's performer matches its OWN sealed
// sub-union with no else arm, so a case it does not answer is a compile error INSIDE
// the block folder. The composition root below matches nothing: it lists performers.
// That is what makes a novel effect kind cost ZERO PRODUCTION sites outside the
// owning folder — earned by the real compiler in `gateEffectKindBlockTest`, and
// measured against the live and test trees by the gate's own censuses.
//
// WHAT IS TRADED FOR IT, stated rather than hidden: routing an erased Effect to a
// performer is RUNTIME dispatch, which is weaker than the exhaustive `when` it
// replaces. The four answers are (a) [NarrowEffect], so no cast is unchecked,
// (b) the diagnostic floor below, so an unclaimed effect is never silently dropped,
// (c) gate check C13's handler half, which walks the LIVE sealed hierarchy and
// denies a leaf no registered performer claims, and (d) the same check's
// exactly-its-own-leaves half, which denies a performer that OVER-claims — the
// first-claim-wins scan below makes order meaningful, so an over-claiming `narrow`
// would swallow every effect registered behind it.

/** The one word the system uses for an effect nobody registered a performer for. */
const val ORPHAN_EFFECT = "no block registered a performer for effect"

/**
 * A block's single public contribution to the perform seam — the effect-side twin of
 * [BlockRegistration].
 *
 * [block] is the owner's name, which is what the assembly refuses a collision on;
 * the two seams are the block's own, and neither the spine nor the root states the
 * sub-union type.
 */
data class EffectPerformer<E : Effect>(
    val block: String,
    val narrow: NarrowEffect<E>,
    val perform: PerformEffect<E>,
) {
    /** Narrow, then perform. False means "not this block's" — and no cast anywhere. */
    fun tryPerform(effect: Effect): Boolean {
        val mine = narrow(effect) ?: return false
        perform(mine)
        return true
    }
}

/**
 * THE ASSEMBLED DISPATCHER. The composition root's one call: performers in, a total
 * perform seam out.
 *
 * A CONSTRUCTED type rather than a top-level function, and for [RegistryBuilder]'s
 * exact reason — it makes a decision, it REFUSES two blocks claiming one seam, and a
 * decision with no instance behind it cannot be exercised on its own.
 *
 * THE REFUSAL LIVES AT ASSEMBLY, and that placement is forced rather than chosen.
 * `Sink.perform` returns Unit and runs at boundary step 9 — after the commit at step
 * 7 and the state adoption at step 8 — so a Notice cannot be folded there by
 * construction; and `Boundary<S>` is generic in S and cannot name [SpineSlice] even
 * if it wanted to. Assembly is the one seam upstream of perform where a refusal
 * naming the offending block can exist, so that is where it is.
 */
class Performers(private val registered: List<EffectPerformer<*>>) {

    init {
        val blocks = registered.map { it.block }
        check(blocks.toSet().size == blocks.size) {
            "two blocks registered an effect performer under the same name: $blocks"
        }
    }

    /**
     * Route one effect to the block that claims it.
     *
     * Returns null when it was performed, and THE DIAGNOSTIC when nobody claimed it —
     * the floor `unclaimedArm` has in the fold, spelled for a seam that cannot fold.
     * Handing the diagnostic BACK rather than performing it here is what keeps the
     * spine-owned Diag performer at the root.
     */
    fun perform(effect: Effect): Effect.Diag? =
        if (registered.any { it.tryPerform(effect) }) {
            null
        } else {
            Effect.Diag(effect.at, "$ORPHAN_EFFECT `${effect::class.simpleName}`")
        }

    /** Which blocks contributed. The input gate check C13's handler half runs over. */
    fun blocks(): List<String> = registered.map { it.block }

    /**
     * The registered performers, IN DISPATCH ORDER.
     *
     * Published because the order is meaningful — [perform] is first-claim-wins — and
     * because `narrow` is a lambda authored inside a block file that no lint reads. A
     * performer whose narrow over-claimed would swallow every effect behind it while
     * every leaf still "performed", so C13's handler half is given the individual
     * performers and asked whether each claims EXACTLY its own leaves. A check that
     * could only see the assembled whole could not ask that question.
     */
    fun claims(): List<EffectPerformer<*>> = registered
}
