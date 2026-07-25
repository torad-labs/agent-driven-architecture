// ── spine/ports/sink — the perform seam (F5, F7) ────────────────────────────
// INTERFACES ONLY (C11).
//
// `perform` accepts a KeyedEffect and NOTHING ELSE, so an effect can never
// cross this seam without the idempotency key 14.6 depends on.
//
//   LIVE      perform once, for real
//   REPLAY    collect the descriptor; TOUCH NOTHING
//   RECOVERY  re-drive un-acknowledged effects; the sink dedupes on the key
//
// REPLAY and RECOVERY are constructed and tested, not merely declared — the
// shipped reference declared REPLAY in both ports and constructed it nowhere.

import type { EffectBase } from "../pure/effect";
import type { KeyedEffect } from "../pure/keyed-effect";

export type PerformMode = "LIVE" | "REPLAY" | "RECOVERY";

export interface Sink {
  perform(keyed: KeyedEffect<EffectBase>, mode: PerformMode): void;
}
