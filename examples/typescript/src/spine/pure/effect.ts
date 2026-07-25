// ── spine/pure/effect — the sealed ROOT of what the fold RETURNS (L3, F7) ───
// The base declares `at`. That is the L3 demonstration in miniature: the
// shipped reference had a `Diag` with no timestamp; now every effect in the
// system carries one BY CONSTRUCTION, because the shared field is declared on
// the parent exactly once.
//
// NO ID FIELD, EVER (F7 / G9). The fold's return type is `Effect[]`, so any
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
