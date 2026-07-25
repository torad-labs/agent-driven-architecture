// ── spine/pure/actor — the stamp: who acted, and under whose permission ─────
// Two orthogonal questions, two types (F3, §4):
//
//   Actor      answers WHO ACTED.              Closed, two values, never grows (5.1).
//   Authority  answers UNDER WHOSE PERMISSION. An opaque principal id, resolved
//              at the boundary through the product-owned AuthorityResolver seam.
//
// The irreversible gate keys on the AUTHORITY, never on the Actor (G1, amended).
// That is what makes an unattended confirmer — a policy tier, a second-agent
// reviewer, a deferred approval queue — representable without growing the Actor
// contract, which 5.1 forbids.

package adr.spine.pure

/**
 * The entire actor contract. It does not grow with the application: a tenth kind
 * of confirmer adds an Authority value, never an Actor variant.
 */
enum class Actor { Human, Agent }

/**
 * The principal an action was admitted under. An identifier, not a variant set —
 * like TicketId. Resolved at the boundary; never chosen by a tool or a model.
 */
@JvmInline
value class Authority(val id: String)

/**
 * The stamp, minted exactly once per step, at the boundary, and carried on every
 * Command. Constructible ONLY inside the spine/boundary folder (gate check C4).
 */
data class Signature(val by: Actor, val authority: Authority)
