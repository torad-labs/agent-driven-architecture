// ── spine/pure/keyed-effect — the transport that crosses the perform seam (F7) ─
// 14.6 rests the whole recovery-path safety claim on "the effect's id is its
// idempotency key", and no port ever constructed one: the same confirm applied
// twice paged on-call TWICE.
//
// The key is NOT a field on Effect. Under L3 a shared property belongs on the
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
