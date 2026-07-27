// ── spine/pure/actor — the stamp: who acted, and under whose permission ─────
// Two orthogonal questions, two types (F3, §4):
//
//   Actor      answers WHO ACTED.              Closed; grows only at architecture
//                                              revision, never per application.
//   Authority  answers UNDER WHOSE PERMISSION. An opaque principal id, resolved
//              at the boundary through the product-owned AuthorityResolver seam.
//
// The irreversible gate keys on the AUTHORITY, never on the Actor (G1, amended).
// That is what makes an unattended confirmer — a policy tier, a second-agent
// reviewer, a deferred approval queue — representable without adding an Actor
// variant: a tenth kind of confirmer is a new Authority id, never a new Actor.

package adr.spine.pure

/**
 * The entire actor contract. It grows only at ARCHITECTURE REVISION, never per
 * application: a tenth kind of confirmer adds an Authority value, never a variant
 * here.
 *
 * `Spine` is what a revision looks like. The spine itself authors steps nobody
 * asked for — a conflated input, a turn that ignored cancellation, a fault caught
 * off a port — and stamping those `Agent` said a model decided them. It did not.
 * The timeline had no way to say who did until this value existed.
 */
enum class Actor { Human, Agent, Spine }

/**
 * The principal an action was admitted under. An identifier, not a variant set —
 * like TicketId. Resolved at the boundary; never chosen by a tool or a model.
 */
@JvmInline
value class Authority(val id: String)

/**
 * The stamp, minted exactly once per step, at the boundary, and carried on every
 * Command. Constructible ONLY inside the spine/boundary folder (gate check C4).
 *
 * DELIBERATELY NOT a data class. A data class ships a synthesized `copy()`, and
 * `sig.copy(by = Actor.Human)` is a forged stamp no constructor rule can see:
 * C4(d) matches `Signature.<init>` as a resolved call, and `copy` is a second,
 * synthesized production site with a different name. A plain class has exactly
 * one production site — the constructor the gate watches. Value equality is
 * spelled out because replay compares committed records field for field, and a
 * GateTest pins the missing `data` modifier so it cannot quietly return.
 */
class Signature(val by: Actor, val authority: Authority) {

    override fun equals(other: Any?): Boolean =
        other is Signature && other.by == by && other.authority == authority

    override fun hashCode(): Int = 31 * by.hashCode() + authority.hashCode()

    override fun toString(): String = "Signature(by=$by, authority=$authority)"
}
