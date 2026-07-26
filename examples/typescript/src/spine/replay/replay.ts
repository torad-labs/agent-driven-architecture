// ── spine/replay/replay — a LIVE run against its REPLAY (F5) ───────────────
// The shipped harness folded the same in-memory array twice through a pure
// function and asserted the two were equal. That is f(x) == f(x): true by
// definition, and measured to catch nothing — an impure tool that read a
// mutable global and performed a side effect passed it, because the harness
// never invoked a tool at all.
//
// What replays here is the COMMITTED BYTES, and what they are compared against
// is what a LIVE boundary actually did:
//
//   refold(initial, records, dispatchers)     re-derive state + the FULL keyed
//                                             effect sequence, timestamps and
//                                             keys included, from the bus alone
//   collectPerform(..., mode)                 drive the perform seam in REPLAY
//                                             (collect, touch nothing) or in
//                                             RECOVERY (re-drive, deduped)
//   assertContextFaithful(...)                re-derive each step's context
//                                             digest and compare it to the
//                                             fixture the step committed
//
// What REPLAY buys, exactly (A2): determinism over a RECORDED TIMELINE —
// forensics, audit, production-traces-as-fixtures. NOT behavioural
// reproducibility: re-running the model is not deterministic, and inputs that
// were conflated away were never recorded. What IS guaranteed is that the run
// that WAS recorded re-derives exactly, bit for bit, from its own committed
// bytes.

import type { PerformMode, Sink } from "../ports/sink";
import { render } from "../pure/context";
import type { EffectBase } from "../pure/effect";
import type { KeyedEffect } from "../pure/keyed-effect";
import { keyedEffect } from "../pure/keyed-effect";
import type { StepRecord } from "../pure/step-record";
import type { Dispatchers } from "../pure/verb";

export interface Refolded<S> {
  readonly state: S;
  readonly effects: readonly KeyedEffect<EffectBase>[];
}

/** Re-fold ONLY the committed bytes. `now` comes off the record (F8); the
 *  effect key comes off the record's position, which is exactly the committed
 *  step index the live boundary keyed with (F7). */
export function refold<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
): Refolded<S> {
  let state = initial;
  const effects: KeyedEffect<EffectBase>[] = [];
  records.forEach((record, step) => {
    const out = dispatchers.fold(state, record.results, record.now, record.sig);
    state = out.state;
    out.effects.forEach((effect, index) => effects.push(keyedEffect(step, index, effect)));
  });
  return { state, effects };
}

/** Drive the perform seam over a committed timeline. In REPLAY the sink must
 *  touch nothing; in RECOVERY a deduping sink drops anything already
 *  acknowledged, so re-driving after a crash is idempotent. */
export function collectPerform<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
  sink: Sink,
  mode: PerformMode,
): void {
  refold(initial, records, dispatchers).effects.forEach((keyed) => sink.perform(keyed, mode));
}

/** F4/G15: the committed context digest must be re-derivable from committed
 *  State. A change to `projectContext` that silently alters what the model saw
 *  fails HERE — without re-running the model. */
export function contextDivergence<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
): readonly string[] {
  let state = initial;
  const problems: string[] = [];
  records.forEach((record, step) => {
    const digest = render(dispatchers.projectContext(state, record.staged));
    if (digest !== record.context.digest) {
      problems.push(`step ${step}: context digest diverged`);
    }
    state = dispatchers.fold(state, record.results, record.now, record.sig).state;
  });
  return problems;
}
