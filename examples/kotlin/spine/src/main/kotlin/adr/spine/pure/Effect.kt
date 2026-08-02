// ── spine/pure/effect — the sealed ROOT of every effect descriptor ─────────
// Plain data. The fold RETURNS these; only the boundary PERFORMS them.
//
// The parent declares `at` ONCE — the G12 demonstration in miniature: the shipped
// reference had a Diag with no timestamp, and now every effect that will ever
// exist carries one by construction.
//
// NO `id` FIELD, EVER (G9). The fold's return type is List<Effect>, so a key on
// Effect would be a field the fold CAN set, and eventually would — which is what
// G9 forbids. The idempotency key rides KeyedEffect instead, which only the
// boundary and the replay harness can construct. The wrong thing is unwritable.

package adr.contract

import adr.spine.pure.EffectClass
import adr.spine.pure.Timestamp

sealed class Effect(
    /** When the fold decided this. Declared once, carried by every variant. */
    open val at: Timestamp,
    /**
     * WHAT THIS EFFECT COSTS IF IT HAPPENS WRONGLY (docs/DECISIONS.md:85).
     *
     * G12 applied to a second shared property: declared ONCE on the sealed parent, in
     * the constructor, so the parent actually holds it and a new leaf does not compile
     * until it supplies one — the classification is TOTAL by the compiler rather than
     * by a table someone maintains.
     *
     * The value is supplied by the LEAF'S OWN SUPERCLASS CALL, never by the leaf's
     * public constructor, and that placement is the whole of the guarantee: a fold arm
     * has no argument to pass, and a data-class `copy()` covers only the leaf's own
     * parameters, so neither can move an effect between classes. Gate check C17 reads
     * exactly that superclass call to derive the Irreversible leaf set.
     */
    open val effectClass: EffectClass,
) {

    /** The spine's own effect: a diagnostic line for a rejection or a refusal. */
    data class Diag(override val at: Timestamp, val note: String) :
        Effect(at, EffectClass.Routine)
}
