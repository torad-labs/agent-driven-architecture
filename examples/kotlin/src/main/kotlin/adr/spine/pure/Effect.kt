// ── spine/pure/effect — the sealed ROOT of every effect descriptor ─────────
// Plain data. The fold RETURNS these; only the boundary PERFORMS them.
//
// The parent declares `at` ONCE — the L3 demonstration in miniature: the shipped
// reference had a Diag with no timestamp, and now every effect that will ever
// exist carries one by construction.
//
// NO `id` FIELD, EVER (F7). The fold's return type is List<Effect>, so a key on
// Effect would be a field the fold CAN set, and eventually would — which is what
// G9 forbids. The idempotency key rides KeyedEffect instead, which only the
// boundary and the replay harness can construct. The wrong thing is unwritable.

package adr.contract

import adr.spine.pure.Timestamp

sealed interface Effect {
    /** When the fold decided this. Declared once, carried by every variant. */
    val at: Timestamp

    /** The spine's own effect: a diagnostic line for a rejection or a refusal. */
    data class Diag(override val at: Timestamp, val note: String) : Effect
}
