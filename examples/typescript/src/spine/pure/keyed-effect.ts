// ── spine/pure/keyed-effect — the boundary's transport (G9) ─────────────────
// 14.6 rests the whole recovery-path safety claim on "the effect's id is its
// idempotency key" — and no port ever constructed one. The fix is NOT an id on
// Effect: that would put key construction inside the fold, which G9 forbids.
//
// So the parent is SPLIT:
//   Effect       is the FOLD's transport      and declares `at`.
//   KeyedEffect  is the BOUNDARY's transport  and declares `key` once, for
//                every effect that ever crosses `perform`.
//
// The key is derived from the COMMITTED step index and the effect's position
// within that step — which means it is literally unavailable until `bus.append`
// has returned. Commit strictly precedes perform not by convention but because
// step 9 cannot run until step 7 has returned the index.
//
// Constructible only inside `spine/boundary/**` and `spine/replay/**` (C5).

import type { EffectBase } from "./effect";
import type { StepIndex } from "./ids";

export interface EffectKey {
  readonly step: StepIndex;
  readonly index: number;
}

export interface KeyedEffect<E extends EffectBase = EffectBase> {
  readonly key: EffectKey;
  readonly effect: E;
}

export function keyedEffect<E extends EffectBase>(
  step: StepIndex,
  index: number,
  effect: E,
): KeyedEffect<E> {
  return { key: { step, index }, effect };
}

/** The dedup key a RECOVERY sink compares on. */
export function keyOf(key: EffectKey): string {
  return `${key.step}:${key.index}`;
}
