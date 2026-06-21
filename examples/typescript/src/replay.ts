// ── Replay: tests are the outermost ring (seam 07) ──────────────────────────
// Because the bus is append-only and the fold is pure, a recorded timeline
// re-folds to a bit-identical state every time — with no model, network, or
// clock. Fold it TWICE; assert the two results are identical, then return the
// golden state and effects for the caller to assert against.

import { deepStrictEqual } from "node:assert";
import type { State } from "./domain";
import type { Effect } from "./effect";
import { foldAll, type RecordedStep } from "./fold";

export interface ReplayOutcome {
  readonly state: State;
  readonly effects: readonly Effect[];
}

export function replay(initial: State, recorded: readonly RecordedStep[]): ReplayOutcome {
  const [a, fa] = foldAll(initial, recorded);
  const [b, fb] = foldAll(initial, recorded);
  // determinism: same recorded input → identical state and identical effects
  deepStrictEqual(a, b);
  deepStrictEqual(fa, fb);
  return { state: a, effects: fa };
}
