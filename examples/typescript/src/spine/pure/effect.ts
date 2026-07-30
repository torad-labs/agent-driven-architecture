// ── spine/pure/effect — the sealed ROOT of what the fold RETURNS (G12, G9) ──
// The base declares `at`. That is the G12 demonstration in miniature: the
// shipped reference had a `Diag` with no timestamp; now every effect in the
// system carries one BY CONSTRUCTION, because the shared field is declared on
// the parent exactly once.
//
// NO ID FIELD, EVER (G9).      The fold's return type is `Effect[]`, so any
// `key` declared here would be a field the fold *can* set — and eventually
// would. The idempotency key lives on `KeyedEffect` instead, which only the
// boundary and the replay harness may construct, and which is the only thing
// `perform` accepts. The wrong thing is unwritable rather than merely
// discouraged.

import type { Timestamp } from "./ids";

export interface EffectBase {
  readonly kind: string;
  readonly at: Timestamp;
}

/** The spine's own effect: a diagnostic line. Never a domain action. */
export interface Diag extends EffectBase {
  readonly kind: "Diag";
  readonly note: string;
}

export type SpineEffect = Diag;

export function diag(at: Timestamp, note: string): Diag {
  return { kind: "Diag", at, note };
}

// ── THE HANDLER SPLIT — effect performance, registrable per block ──────────
// The CASES stay sealed here, in the spine: a block appends to `Effect` through
// its own sub-union in its own contract, and nothing below changes that. What a
// block registers is a HANDLER — a function, not a type — so the closed set the
// compiler checks is untouched while the PERFORMANCE of a case moves into the
// folder that owns it. That split is the one the module graph depends on.
//
// `Handlers<E>` is a mapped type over the union's OWN discriminant, so it is
// derived, never re-spelled: a block's table is `Handlers<TriageEffect>` and
// stops compiling the moment `TriageEffect` grows a case the table does not
// answer. That error lands INSIDE the block folder. The composition root's
// `Handlers<Effect>` is satisfied by the block function's DECLARED return type,
// so the root stays green — which is what makes a novel effect kind cost ZERO
// PRODUCTION sites outside the owning folder, earned by the real compiler in
// test/gate/exhaustiveness.test.ts rather than asserted here.

export interface EffectHandler<E extends EffectBase> {
  (effect: E): void;
}

/** One handler per kind of `E`, keyed by the union's own discriminant. */
export type Handlers<E extends EffectBase> = {
  readonly [K in E["kind"]]: EffectHandler<Extract<E, { readonly kind: K }>>;
};

/** The one word the system uses for an effect nobody registered a handler for. */
export const ORPHAN_EFFECT = "no block registered a handler for effect kind";

/**
 * THE FLOOR UNDER EFFECT DISPATCH — `unclaimedArm`'s property at the perform seam.
 *
 * Not `unclaimedArm` itself, and the difference is structural rather than a
 * preference: `unclaimedArm` runs inside the pure fold, BEFORE the commit, which
 * is the only place a `Notice` can be folded. `perform` is boundary step 9 —
 * after the commit and after the state adoption — and returns `void`, so a
 * notice is unwritable here by construction. What survives is the half that
 * matters: TOTAL, and never silent. An orphaned kind is diagnosed through the
 * spine's own `Diag` effect, which the composition root already performs.
 *
 * The one cast this file owns. `Handlers<E>` is a mapped type, so indexing it
 * with a runtime `effect.kind` yields a union of handler types whose parameters
 * intersect to `never`; the erasure is the same trade `spine/pure/verb` makes
 * for its registry, confined to one expression in one file. It is also what
 * makes the undefined branch REACHABLE and therefore testable: the static table
 * cannot have a hole, a table thinned at runtime can.
 */
export function performEffect<E extends EffectBase>(
  handlers: Handlers<E>,
  effect: E,
  diagnose: EffectHandler<Diag>,
): void {
  const erased = handlers as unknown as Readonly<Record<string, EffectHandler<E> | undefined>>;
  const handler = erased[effect.kind];
  if (handler === undefined) {
    diagnose(diag(effect.at, `${ORPHAN_EFFECT} \`${effect.kind}\``));
    return;
  }
  handler(effect);
}
