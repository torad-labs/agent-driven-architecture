// ── spine/concurrency/consumer — THE BARGE-IN LOOP (12.1–12.4) ─────────────
//
// WHAT WAS BROKEN, RESTATED SO IT CANNOT BE RE-SHIPPED. 12.3's drain loop reads:
//
//     while (running) {
//         message = mailbox.take()          ← BLOCKS
//         ...
//         outcome  = await(inFlight)        ← loop-body indentation
//     }
//
// Under the ordinary reading of `await`, control never reaches `take()` while a
// turn is in flight. `turnInFlight` is therefore false at every `take()`, ALL
// THREE guards below it are dead code, and Fig 12.1's mid-turn "take Interrupt"
// is unproducible. The loop cannot conflate, cannot preempt, and cannot
// drain-join. It looks like a barge-in mailbox and is a serial queue.
//
// THE FIX IS ONE LINE OF SHAPE, NOT ONE LINE OF CODE: a SELECT over
// { the next message, the running turn's completion }. Kotlin has `select`;
// TypeScript has `Promise.race`. Because both arms are outstanding at once, a
// message is OBSERVABLE WHILE A TURN RUNS, which is the property every policy
// below depends on.
//
//   Input      per-source policy (12.2): conflate to the newest and FOLD A COUNT,
//              or queue durably, dedupe on a key and ack only after the commit.
//   Interrupt  PREEMPT: cancel, JOIN, then start — so two folds cannot interleave.
//   Drain      DEFER: never cancels. Wait, finalize, stop.
//
// ONE OUTSTANDING `take()` IS HELD ACROSS ITERATIONS. `Promise.race` discards
// the losers but does not cancel them, so a take() that lost must NOT be
// re-issued — that would consume and drop a message. Kotlin's `select` is atomic
// and needs no such bookkeeping; this is the one place the two ports differ in
// mechanism rather than in spelling.
//
// THERE IS A RUN-STATE HANDLE, AND DENYING IT IS WHAT MADE 12.3 UNIMPLEMENTABLE.
// Its safety does not come from being absent; it comes from SINGLE-CONSUMER
// OWNERSHIP: exactly one loop reads or writes it, so it is never shared and
// needs no lock. That is the difference between "no mutable state" (false) and
// "no *shared* mutable state" (true, and the whole point).
//
// THE TURN RUNNER IS INJECTED, NEVER IMPORTED. This folder does not name the
// agent-loop SDK; the SDK stays confined to `spine/agent/loop` (G3/I5, C1).
// This folder also names no block and no composition root (C15).
//
// DISPATCHER CONFINEMENT. The consumer mints the turn's only channel into the
// system (`submit`) and calls the boundary itself. Both are synchronous and both
// run on the consumer's own single-threaded context, so `onStepFinish` is serial
// by construction and two folds cannot interleave. Kotlin gets the same property
// from a single-threaded dispatcher the consumer owns. This one is structural
// rather than gate-checkable, and it is labelled as such.

import type { Action, FinishedStep } from "../boundary/action";
import type { SourceKey, SourceName, StepIndex } from "../pure/ids";
import type {
  DrainMessage,
  InputMessage,
  InputPolicy,
  InterruptMessage,
  Message,
} from "../pure/mailbox";
import { CANCEL_DEADLINE_MS, DRAIN_DEADLINE_MS, policyFor } from "../pure/mailbox";
import type { Recall, RelayEntry, StagedInput } from "../pure/staged";
import { RECALL_DEADLINE_MS, emptyRecall, fresh, lastKnown, recalled } from "../pure/staged";
import type { ConsumerEvent, TurnOutcome } from "../pure/turn";
import {
  cancelDeadlineExceeded,
  conflated,
  duplicate,
  turnCancelled,
  turnFailed,
  turnIdle,
  turnOk,
  turnThrew,
} from "../pure/turn";
import type { Mailbox } from "../ports/mailbox";
import type { RelayRead } from "../ports/relay";
import type { Scheduler } from "../ports/scheduler";

/** The boundary, seen through the three lines the consumer actually needs.
 *  Declared here rather than imported, exactly as `spine/surface/controller`
 *  declares its own seam — the consumer never names the `Boundary` class. */
export interface StepSeam {
  onStepFinish(step: FinishedStep): StepIndex;
}

/** What a turn is handed. Three fields, and each one is a rule:
 *   staged  the ORDERED off-bus fixture for this turn — `[Perceived?, Recalled?]`
 *   signal  cooperative cancellation, honoured at a STEP boundary
 *   submit  the ONE channel to the boundary, and it is REVOCABLE */
export interface TurnContext {
  readonly staged: readonly StagedInput[];
  readonly signal: AbortSignal;
  submit(step: FinishedStep): void;
}

export interface TurnRunner {
  /** may throw; the consumer degrades it into `TurnOutcome.Threw` (12.4) */
  run(message: Message, ctx: TurnContext): Promise<void>;
}

/** The relay's read half plus the source name its snapshots are staged under. */
export interface RelayRecall {
  readonly read: RelayRead;
  readonly source: SourceName;
}

export interface ConsumerDeps {
  readonly mailbox: Mailbox;
  readonly scheduler: Scheduler;
  readonly seam: StepSeam;
  readonly turn: TurnRunner;
  /** REQUIRED — default-deny applied to observability. A consumer that cannot
   *  say what it dropped is a consumer that drops silently (12.2). */
  readonly report: (event: ConsumerEvent) => readonly Action[];
  /** REQUIRED — what a Drain finalizes with before the consumer stops. */
  readonly finalize: (message: DrainMessage) => readonly Action[];
  /** per SOURCE; an unlisted source is `DurableQueue` (12.2) */
  readonly policies?: readonly InputPolicy[];
  /** optional — a second tier is optional (11), and this is what makes it so */
  readonly relay?: RelayRecall;
  readonly cancelDeadlineMs?: number;
  readonly drainDeadlineMs?: number;
  readonly recallDeadlineMs?: number;
}

// ── The consumer's PRIVATE run-state handle ─────────────────────────────────
// Not transport, not exported, named by nothing else in the system.
type RunState =
  | { readonly kind: "Idle" }
  | {
      readonly kind: "Running";
      readonly message: Message;
      readonly settled: Promise<TurnOutcome>;
      readonly abort: AbortController;
      /** flips the one-way latch inside the turn's `submit` closure */
      readonly revoke: () => void;
    };

const IDLE: RunState = { kind: "Idle" };

/** What one turn of the select can yield. `ended` rather than `outcome`: an
 *  object literal keyed `outcome` is how a ToolResult is forged, and check C7
 *  denies the shape outside a verb body. */
type LoopEvent =
  | { readonly kind: "Arrived"; readonly message: Message }
  | { readonly kind: "Settled"; readonly ended: TurnOutcome };

type Joined =
  | { readonly kind: "Settled"; readonly ended: TurnOutcome }
  | { readonly kind: "Expired" };

type Fetched =
  | { readonly kind: "Read"; readonly entry: RelayEntry | null }
  | { readonly kind: "Expired" };

interface Conflating {
  readonly message: InputMessage;
  readonly dropped: number;
}

export class SerialConsumer {
  private state: RunState = IDLE;
  /** the ONE outstanding lease on the mailbox; never re-issued after a loss */
  private pending: Promise<LoopEvent> | null = null;
  /** BACKPRESSURE on the durable path: at most one taken-but-unstarted Input.
   *  The mailbox — a real queue — holds the rest, so nothing is dropped and
   *  nothing is buffered unboundedly.
   *
   *  THE NAMED COST: while an Input is held, `take()` is not re-armed, so an
   *  Interrupt queued behind it is observed only once the running turn settles
   *  — bounded by one turn, never dropped. The alternative, re-arming while
   *  holding, is unbounded buffering, which is the failure this bound exists to
   *  prevent. Stated, not hidden. */
  private held: InputMessage | null = null;
  /** the perishable path's ONE slot, plus the count it owes the timeline */
  private conflating: Conflating | null = null;
  private readonly seen = new Set<SourceKey>();
  /** consumer-owned, single-owner, same justification as the run handle */
  private lastKnown: RelayEntry | null = null;
  private stopped = false;
  private readonly log: TurnOutcome[] = [];

  constructor(private readonly deps: ConsumerDeps) {}

  /** every turn that ended, in order — the heartbeat, for tests and operators */
  get outcomes(): readonly TurnOutcome[] {
    return this.log;
  }

  get running(): boolean {
    return this.state.kind === "Running";
  }

  stop(): void {
    this.stopped = true;
  }

  // ── THE SELECT ────────────────────────────────────────────────────────────
  async run(): Promise<void> {
    while (!this.stopped) {
      // Re-arm the lease unless the durable path is already holding one.
      if (this.pending === null && this.held === null) {
        this.pending = this.deps.mailbox
          .take()
          .then((message): LoopEvent => ({ kind: "Arrived", message }));
      }
      const racers: Promise<LoopEvent>[] = [];
      if (this.pending !== null) racers.push(this.pending);
      const running = this.state;
      if (running.kind === "Running") {
        // `settled` NEVER rejects: the turn runner captures a throw into
        // TurnOutcome.Threw, so the race can never see a rejection (12.4).
        racers.push(running.settled.then((ended): LoopEvent => ({ kind: "Settled", ended })));
      }
      if (racers.length === 0) return;

      const event = await Promise.race(racers); // ← the whole fix
      switch (event.kind) {
        case "Arrived": {
          this.pending = null;
          await this.onMessage(event.message);
          break;
        }
        case "Settled": {
          const finished = this.state;
          if (finished.kind === "Running") this.settle(finished.message, event.ended);
          await this.resume();
          break;
        }
        default: {
          const _never: never = event;
          return _never;
        }
      }
    }
  }

  // ── Message handling ──────────────────────────────────────────────────────
  private async onMessage(message: Message): Promise<void> {
    switch (message.kind) {
      case "Input":
        return this.onInput(message);
      case "Interrupt":
        return this.onInterrupt(message);
      case "Drain":
        return this.onDrain(message);
      default: {
        const _never: never = message;
        return _never;
      }
    }
  }

  private async onInput(message: InputMessage): Promise<void> {
    const policy = policyFor(this.deps.policies ?? [], message.source);
    switch (policy.kind) {
      case "DurableQueue": {
        if (this.seen.has(message.key)) {
          // 12.2's own catalog row: a durable queue re-delivers, so the second
          // arrival is refused, reported, and acked — never folded twice.
          this.emit(duplicate(message.source, message.key));
          this.deps.mailbox.ack(message);
          return;
        }
        if (this.state.kind === "Running") {
          this.held = message;
          return;
        }
        this.seen.add(message.key);
        return this.start(message);
      }
      case "Perishable": {
        if (this.state.kind === "Running") {
          const slot = this.conflating;
          if (slot === null) {
            this.conflating = { message, dropped: 0 };
            return;
          }
          // the replaced input will never be folded — release its lease
          this.deps.mailbox.ack(slot.message);
          if (slot.message.source === message.source) {
            this.conflating = { message, dropped: slot.dropped + 1 };
            return;
          }
          // A DIFFERENT perishable source won the slot. The count belongs to the
          // source whose inputs were SHED, not to the one that shed them —
          // otherwise a busy feed silently charges its drops to a quiet one, and
          // a mis-attributed counter is exactly the kind of not-quite-silent
          // failure this whole block exists to prevent.
          this.flush({ message: slot.message, dropped: slot.dropped + 1 });
          this.conflating = { message, dropped: 0 };
          return;
        }
        return this.start(message);
      }
      default: {
        const _never: never = policy;
        return _never;
      }
    }
  }

  private async onInterrupt(message: InterruptMessage): Promise<void> {
    // PREEMPT: cancel, JOIN, and only then start — so two folds can never
    // interleave, and the interrupt's turn begins long before the cancelled
    // turn would have finished on its own.
    if (this.state.kind === "Running") await this.cancelAndJoin(message.source);
    this.deps.mailbox.ack(message);
    return this.start(message);
  }

  private async onDrain(message: DrainMessage): Promise<void> {
    // DEFER. Note what is NOT called here: `abort()`. A Drain never preempts.
    const running = this.state;
    if (running.kind === "Running") {
      const joined = await this.joinWithin(running.settled, this.drainDeadline());
      switch (joined.kind) {
        case "Settled":
          this.settle(running.message, joined.ended);
          break;
        case "Expired":
          this.abandon(running, this.drainDeadline());
          break;
        default: {
          const _never: never = joined;
          return _never;
        }
      }
    }
    // anything conflated away is still owed its count on the timeline
    const slot = this.conflating;
    this.conflating = null;
    if (slot !== null) this.flush(slot);

    const actions = this.deps.finalize(message);
    if (actions.length > 0) this.deps.seam.onStepFinish({ by: "Agent", staged: [], actions });
    this.deps.mailbox.ack(message);
    this.stop();
  }

  /** After a turn settles: start whatever was held back while it ran. */
  private async resume(): Promise<void> {
    if (this.stopped) return;
    const held = this.held;
    if (held !== null) {
      this.held = null;
      return this.onInput(held);
    }
    const slot = this.conflating;
    if (slot !== null) {
      this.conflating = null;
      // Reported BEFORE the winning turn starts, so the conflation line is in
      // the context digest that turn's first step commits — the reasoner is
      // told it is shedding load, which is what "observable" has to mean.
      this.flush(slot);
      return this.onInput(slot.message);
    }
  }

  // ── Starting, cancelling, settling ────────────────────────────────────────
  private async start(message: Message): Promise<void> {
    const staged = await this.stage(message);
    const abort = new AbortController();
    let revoked = false;
    let steps = 0;
    const ctx: TurnContext = {
      staged,
      signal: abort.signal,
      // THE ONE CHANNEL, AND IT IS REVOCABLE. This closure is the only route a
      // turn has into the system; `revoke()` flips a one-way latch inside it.
      submit: (step: FinishedStep): void => {
        if (revoked) return;
        steps += 1;
        this.deps.seam.onStepFinish(step);
      },
    };
    const settled = this.deps.turn
      .run(message, ctx)
      .then((): TurnOutcome => (steps === 0 ? turnIdle : turnOk(steps)))
      .catch((thrown: unknown): TurnOutcome => turnThrew(faultOf(thrown)));
    this.state = { kind: "Running", message, settled, abort, revoke: () => void (revoked = true) };
  }

  /** 12.3, with the bound 12.3 itself says an unbounded join needs. */
  private async cancelAndJoin(by: SourceName): Promise<void> {
    const running = this.state;
    if (running.kind !== "Running") return;
    running.abort.abort(); // cooperative; honoured at a step boundary
    const joined = await this.joinWithin(running.settled, this.cancelDeadline());
    switch (joined.kind) {
      case "Settled":
        // Steps completed before the cancel STAY folded and their effects STAY
        // performed. There is no rollback and no compensating write.
        this.settle(running.message, joined.ended.kind === "Threw" ? joined.ended : turnCancelled(by));
        return;
      case "Expired":
        this.abandon(running, this.cancelDeadline());
        return;
      default: {
        const _never: never = joined;
        return _never;
      }
    }
  }

  /** THE HONEST COST, NAMED AND COUNTED. The join is bounded, so a turn that
   *  ignores cancellation may never unwind — the design bounds the CONSUMER,
   *  not the turn, and removing that leak requires an unbounded join, which
   *  12.3 itself calls exactly a hang.
   *
   *  What the bound does NOT cost is 12.3's real guarantee. `revoke()` drops
   *  every later `submit`, so the abandoned turn cannot fold anything after the
   *  deadline: two folds cannot interleave EVEN WHEN THE JOIN FAILS. The
   *  deadline becomes the step boundary. The turn is never awaited again. */
  private abandon(running: Extract<RunState, { kind: "Running" }>, afterMs: number): void {
    running.revoke();
    this.state = IDLE;
    this.emit(cancelDeadlineExceeded(running.message.source, afterMs));
  }

  private settle(message: Message, ended: TurnOutcome): void {
    this.state = IDLE;
    this.log.push(ended);
    switch (ended.kind) {
      case "Ok":
      case "Idle":
      case "Cancelled":
        // ACK ONLY AFTER THE COMMIT (12.2).
        this.deps.mailbox.ack(message);
        return;
      case "Threw":
        // NOT acked: the lease is still out, so a crash re-delivers rather than
        // loses. The dedupe key is what stops the re-delivery folding twice.
        // The exception never crossed this loop — the consumer is the heartbeat
        // and it does not stop (12.4).
        this.emit(turnFailed(message.source, ended.fault));
        return;
      default: {
        const _never: never = ended;
        return _never;
      }
    }
  }

  private async joinWithin(settled: Promise<TurnOutcome>, bound: number): Promise<Joined> {
    const deadline = new AbortController();
    const joined = await Promise.race<Joined>([
      settled.then((ended): Joined => ({ kind: "Settled", ended })),
      this.deps.scheduler.after(bound, deadline.signal).then((): Joined => ({ kind: "Expired" })),
    ]);
    deadline.abort(); // never leave a decided bound holding a live timer
    return joined;
  }

  // ── The relay: read ONCE PER TURN, bounded by the party that must not block ─
  private async stage(message: Message): Promise<readonly StagedInput[]> {
    const relay = this.deps.relay;
    const perceived = this.perceivedOf(message);
    if (relay === undefined) return perceived;
    // ORDER IS LAW: [Perceived?, Recalled?]. It changes the rendered digest,
    // and the digest is what the committed ContextFixture pins.
    return [...perceived, recalled(relay.source, await this.recall(relay))];
  }

  private perceivedOf(message: Message): readonly StagedInput[] {
    switch (message.kind) {
      case "Input":
        return [message.staged];
      case "Interrupt":
      case "Drain":
        return [];
      default: {
        const _never: never = message;
        return _never;
      }
    }
  }

  /** `Fresh` means "fresh as of turn start", and the book says so: the relay is
   *  read once per TURN, not once per step. A slow relay therefore costs the
   *  fast path at most one bounded wait, and the degrade is TYPED. */
  private async recall(relay: RelayRecall): Promise<Recall> {
    const deadline = new AbortController();
    const fetched = await Promise.race<Fetched>([
      relay.read
        .latest()
        .then((entry): Fetched => ({ kind: "Read", entry }))
        // a relay that throws must not kill the consumer either — same rule
        // as 12.4, and it degrades to last-known rather than to a crash
        .catch((): Fetched => ({ kind: "Expired" })),
      this.deps.scheduler
        .after(this.recallDeadline(), deadline.signal)
        .then((): Fetched => ({ kind: "Expired" })),
    ]);
    deadline.abort();
    switch (fetched.kind) {
      case "Read": {
        if (fetched.entry === null) return emptyRecall;
        this.lastKnown = fetched.entry;
        return fresh(fetched.entry);
      }
      case "Expired":
        // STALE IS NEVER PRESENTED AS FRESH: a different variant, a different
        // rendered line, a different committed digest.
        return this.lastKnown === null ? emptyRecall : lastKnown(this.lastKnown);
      default: {
        const _never: never = fetched;
        return _never;
      }
    }
  }

  // ── Reporting: never silent, and it travels the ONE existing path ─────────
  // resolveAction → gate → fold → commit → signed Command. A busy-drop is a
  // decision, so it signs, exactly like A1's presentation verbs.
  private emit(event: ConsumerEvent): void {
    const actions = this.deps.report(event);
    if (actions.length === 0) return;
    this.deps.seam.onStepFinish({ by: "Agent", staged: [], actions });
  }

  private flush(slot: Conflating): void {
    if (slot.dropped > 0) this.emit(conflated(slot.message.source, slot.dropped));
  }

  private cancelDeadline(): number {
    return this.deps.cancelDeadlineMs ?? CANCEL_DEADLINE_MS;
  }

  private drainDeadline(): number {
    return this.deps.drainDeadlineMs ?? DRAIN_DEADLINE_MS;
  }

  private recallDeadline(): number {
    return this.deps.recallDeadlineMs ?? RECALL_DEADLINE_MS;
  }
}

function faultOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}
