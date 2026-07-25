// ── spine/concurrency/in-memory — the fakes the two rungs are wired with ────
// The offline bindings for the mailbox, the relay and elapsed time. Everything a
// deployment would bind to a broker, a store or a real timer is a port; these
// are what the demo and the tests bind instead.
//
// `InMemoryMailbox` implements the LEASE contract, because the lease is the
// whole of 12.2's durability claim: `take()` hands a message out without
// removing it, `ack()` removes it, and `redeliver()` is the crash — everything
// taken but not acked goes back to the head of the queue. A consumer that acked
// before committing would lose work here, visibly, in a test.
//
// `InMemoryRelay` is APPEND-ONLY by construction: `publish` pushes, and there is
// no operation that rewrites or removes an entry. `latest()` is the only read,
// and it returns TEXT — no method handle, no shared mutable object, no
// synchronous request into the deep tier (11.2).
//
// TWO SCHEDULERS, AND BOTH ARE THE POINT:
//   virtualScheduler()  time is a value the test advances by hand. Nothing
//                       sleeps, nothing is timing-dependent, and `now()` is what
//                       a preemption test asserts against.
//   timerScheduler()    delegates to the ambient timer — what a deployment binds,
//                       and what `vi.useFakeTimers()` virtualises, so the same
//                       consumer proves the same property under either.

import type { Timestamp } from "../pure/ids";
import type { Message } from "../pure/mailbox";
import type { RelayEntry } from "../pure/staged";
import type { Mailbox } from "../ports/mailbox";
import type { RelayRead } from "../ports/relay";
import type { Elapsed, Scheduler } from "../ports/scheduler";

export class InMemoryMailbox implements Mailbox {
  private readonly queue: Message[] = [];
  /** taken but not yet acked — the leases a crash would re-deliver */
  private readonly leased: Message[] = [];
  private readonly waiting: ((message: Message) => void)[] = [];

  post(message: Message): void {
    const wake = this.waiting.shift();
    if (wake === undefined) {
      this.queue.push(message);
      return;
    }
    this.leased.push(message);
    wake(message);
  }

  take(): Promise<Message> {
    const next = this.queue.shift();
    if (next !== undefined) {
      this.leased.push(next);
      return Promise.resolve(next);
    }
    return new Promise<Message>((resolve) => void this.waiting.push(resolve));
  }

  ack(message: Message): void {
    const at = this.leased.indexOf(message);
    if (at >= 0) this.leased.splice(at, 1);
  }

  /** THE CRASH. Everything taken but not acked returns to the head of the
   *  queue, in order — which is why "ack only after the commit" re-delivers
   *  rather than loses. */
  redeliver(): void {
    this.queue.unshift(...this.leased.splice(0, this.leased.length));
  }

  get depth(): number {
    return this.queue.length;
  }

  get outstanding(): number {
    return this.leased.length;
  }
}

export class InMemoryRelay implements RelayRead {
  private readonly entries: RelayEntry[] = [];

  /** APPEND-ONLY. There is no update and no delete, here or on the port. */
  publish(at: Timestamp, text: string): void {
    this.entries.push({ publishedAt: at, text });
  }

  latest(): Promise<RelayEntry | null> {
    return Promise.resolve(this.entries.at(-1) ?? null);
  }

  get published(): readonly RelayEntry[] {
    return this.entries;
  }
}

interface Timer {
  readonly at: number;
  settle: (elapsed: Elapsed) => void;
}

export interface VirtualScheduler extends Scheduler {
  /** virtual milliseconds since construction — what a preemption test asserts */
  now(): number;
  advance(ms: number): void;
  readonly pending: number;
}

/** Time as a value. A test that sleeps is a flaky test; this one cannot sleep,
 *  because nothing here is connected to a real clock at all. */
export function virtualScheduler(): VirtualScheduler {
  const timers: Timer[] = [];
  let clock = 0;

  const fire = (): void => {
    for (const timer of timers.filter((t) => t.at <= clock)) {
      const at = timers.indexOf(timer);
      if (at >= 0) timers.splice(at, 1);
      timer.settle("elapsed");
    }
  };

  return {
    now: () => clock,
    get pending(): number {
      return timers.length;
    },
    advance: (ms: number): void => {
      clock += ms;
      fire();
    },
    after: (ms: number, signal: AbortSignal): Promise<Elapsed> =>
      new Promise<Elapsed>((resolve) => {
        if (signal.aborted) {
          resolve("aborted");
          return;
        }
        const timer: Timer = { at: clock + ms, settle: resolve };
        const onAbort = (): void => {
          const at = timers.indexOf(timer);
          if (at >= 0) timers.splice(at, 1);
          resolve("aborted");
        };
        timer.settle = (elapsed): void => {
          signal.removeEventListener("abort", onAbort);
          resolve(elapsed);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        timers.push(timer);
      }),
  };
}

/** What a deployment binds. It reads no clock — only a relative duration — so
 *  C3 holds and `clock.now()` at the boundary stays the one clock read. */
export function timerScheduler(): Scheduler {
  return {
    after: (ms: number, signal: AbortSignal): Promise<Elapsed> =>
      new Promise<Elapsed>((resolve) => {
        if (signal.aborted) {
          resolve("aborted");
          return;
        }
        const onAbort = (): void => {
          clearTimeout(handle);
          resolve("aborted");
        };
        const handle = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve("elapsed");
        }, ms);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
  };
}
