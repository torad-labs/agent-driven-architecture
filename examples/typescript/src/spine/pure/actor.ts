// ── spine/pure/actor — the stamp (G1, amended by F3) ────────────────────────
// TWO orthogonal questions, two types:
//
//   Actor      answers WHO ACTED.              Two values. It never grows (5.1).
//   Authority  answers UNDER WHOSE PERMISSION. An opaque principal id.
//
// The irreversible gate keys on the Authority, NEVER on the Actor. That is what
// makes an unattended confirmer representable (a policy tier acts *through* the
// agent's stream, so `by` is truthfully `Agent`, while its `authority` differs
// from the one that raised the Request) without growing the two-value contract
// 5.1 freezes.
//
// Both fields ride ONE value — `Signature` — minted once per step at the
// boundary and carried onto every Command. Nothing upstream of the boundary can
// name any of these three symbols (gate check C4): an Actor is UNREPRESENTABLE
// where a tool could forge it, not merely unused.

export type Actor = "Human" | "Agent";

declare const AUTHORITY_BRAND: unique symbol;

/** An opaque principal id — like a TicketId, not a variant set. It answers
 *  "under whose permission", and a tenth kind of confirmer adds no type. */
export type Authority = string & { readonly [AUTHORITY_BRAND]: true };

/** The ONLY way to mint an Authority. Denied inside `blocks/**` (check C4). */
export function authority(id: string): Authority {
  return id as Authority;
}

/** Authorship and permission, together, stamped once per step at the boundary. */
export interface Signature {
  readonly by: Actor;
  readonly authority: Authority;
}
