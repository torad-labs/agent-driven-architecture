// ── spine/boundary/in-memory — the fakes the boundary is wired with ────────
// This is the ONE file in the system allowed module-level mutable state
// (check C10), and even here it is confined to closures. Everything an
// application would bind to a real client is a port; these are the offline
// bindings the demo and the tests use.

import type { EffectBase } from "../pure/effect";
import type { StepIndex, Timestamp, CommandId } from "../pure/ids";
import type { KeyedEffect } from "../pure/keyed-effect";
import { keyOf } from "../pure/keyed-effect";
import type { StepRecord } from "../pure/step-record";
import type { Bus } from "../ports/bus";
import type { Clock } from "../ports/clock";
import type { IdSource } from "../ports/id-source";
import type { PerformMode, Sink } from "../ports/sink";

export class InMemoryBus implements Bus {
  private readonly log: StepRecord[] = [];

  append(record: StepRecord): StepIndex {
    this.log.push(record);
    return this.log.length - 1;
  }

  records(): readonly StepRecord[] {
    return this.log;
  }
}

export function fixedClock(at: Timestamp): Clock {
  return { now: () => at };
}

/** A MOVING clock. Every replay test uses one: a frozen clock cannot tell a
 *  faithful re-fold from a lucky one (F8). */
export function movingClock(start: Timestamp, step: Timestamp): Clock {
  let t = start - step;
  return {
    now: () => {
      t += step;
      return t;
    },
  };
}

export function sequentialIds(prefix = "c"): IdSource {
  let n = 0;
  return {
    next: (): CommandId => {
      n += 1;
      return `${prefix}${n}`;
    },
  };
}

/** Records every descriptor that crosses the perform seam — keys, timestamps
 *  and all — then delegates. The recording is what a golden effect sequence is
 *  compared against; the delegate is what actually touches the world. */
export class RecordingSink implements Sink {
  readonly performed: KeyedEffect<EffectBase>[] = [];

  constructor(private readonly inner?: Sink) {}

  perform(keyed: KeyedEffect<EffectBase>, mode: PerformMode): void {
    this.performed.push(keyed);
    this.inner?.perform(keyed, mode);
  }
}

/** The RECOVERY sink (14.6): re-driving a committed timeline after a crash must
 *  not fire an irreversible effect twice. It dedupes on `KeyedEffect.key` — the
 *  key the boundary derived from the committed step index, which is why the
 *  same confirm re-driven twice pages on-call exactly once. */
export class DedupingSink implements Sink {
  readonly fired: KeyedEffect<EffectBase>[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly inner?: Sink) {}

  perform(keyed: KeyedEffect<EffectBase>, mode: PerformMode): void {
    const key = keyOf(keyed.key);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.fired.push(keyed);
    this.inner?.perform(keyed, mode);
  }
}
