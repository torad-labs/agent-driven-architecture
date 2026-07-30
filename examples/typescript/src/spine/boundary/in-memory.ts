// ── spine/boundary/in-memory — the fakes the boundary is wired with ────────
// This is the ONE file in the system allowed module-level mutable state
// (check C10), and even here it is confined to closures. Everything an
// application would bind to a real client is a port; these are the offline
// bindings the demo and the tests use.

import type { Bus } from "../ports/bus";
import type { Clock } from "../ports/clock";
import type { IdSource } from "../ports/id-source";
import type { PerformMode, Sink } from "../ports/sink";
import type { Diag, EffectBase, EffectHandler, Handlers } from "../pure/effect";
import { performEffect } from "../pure/effect";
import type { CommandId, StepIndex, Timestamp } from "../pure/ids";
import type { KeyedEffect } from "../pure/keyed-effect";
import { keyOf } from "../pure/keyed-effect";
import type { StepRecord } from "../pure/step-record";

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
 *  faithful re-fold from a lucky one (G9). */
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

/**
 * THE DISPATCHER, as a Sink. The composition root assembles the table — one
 * contribution per block, plus the spine's own `Diag` — and hands it here; this
 * turns it into the one thing the boundary accepts.
 *
 * It lives beside the two decorators above because it is the third member of the
 * same family: something that takes a `Sink`-shaped decision and returns a
 * `Sink`. Keeping the construction in ONE place is what lets a test build a real
 * sink over a DELIBERATELY THINNED table and watch the floor fire — a
 * missing-handler test that called the floor function directly would prove the
 * function exists, not that it is reachable.
 *
 * REPLAY touches nothing (G9); that contract is unchanged by who performs.
 */
export function handlerSink<E extends EffectBase>(
  handlers: Handlers<E>,
  diagnose: EffectHandler<Diag>,
): Sink {
  return {
    perform(keyed: KeyedEffect<EffectBase>, mode: PerformMode): void {
      if (mode === "REPLAY") return;
      performEffect(handlers, keyed.effect as E, diagnose);
    },
  };
}
