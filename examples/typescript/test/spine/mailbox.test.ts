// ── 12 — THE BARGE-IN MAILBOX, PROVED RATHER THAN ASSERTED ─────────────────
//
// F11, restated: the book's 12.3 drain loop puts `outcome = await(inFlight)` at
// loop-body indentation while `mailbox.take()` blocks at the top. Control never
// reaches `take()` during a turn, `turnInFlight` is false at every `take()`, all
// three guards are dead, and Fig 12.1's mid-turn "take Interrupt" is
// unproducible.
//
// THE BAR FOR THIS FILE IS THAT ITS TESTS CAN TELL THE TWO LOOPS APART. The
// second test below IS the book's loop, run against the same mailbox, the same
// scripted turn and the same virtual clock — and it fails to preempt at exactly
// the point the first one succeeds. Without that contrast the first test proves
// nothing.
//
// TIME IS A VALUE HERE. Nothing sleeps: `virtualScheduler()` advances only when
// a test advances it, so "the interrupt was handled at t=100 and the turn would
// not have finished until t=10 000" is an EXACT assertion, not a race.

import { describe, expect, it, vi } from "vitest";
import type { App } from "../../src/app/wire";
import { wireConsumer } from "../../src/app/wire";
import type { Action } from "../../src/spine/boundary/action";
import type { StepSeam, TurnContext, TurnRunner } from "../../src/spine/concurrency/consumer";
import {
  InMemoryMailbox,
  timerScheduler,
  virtualScheduler,
} from "../../src/spine/concurrency/in-memory";
import type { Mailbox } from "../../src/spine/ports/mailbox";
import type { InputPolicy, Message } from "../../src/spine/pure/mailbox";
import { drain, input, interrupt, perishable } from "../../src/spine/pure/mailbox";
import { perceived } from "../../src/spine/pure/staged";
import type { Harness } from "../harness";
import { effectKinds, harness } from "../harness";
import { must } from "../support/must";

// ── the rig ────────────────────────────────────────────────────────────────

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: () => release() };
}

/** Drain every microtask the consumer chained. A macrotask boundary runs only
 *  after the microtask queue is empty, so this is exhaustive — and it is not a
 *  sleep: no virtual or real time passes. */
function settle(): Promise<void> {
  return new Promise<void>((resolve) => void setImmediate(resolve));
}

const act = (ctx: TurnContext, ...actions: Action[]): void =>
  ctx.submit({ by: "Agent", staged: ctx.staged, actions });

const PRIORITY: Action = { tool: "setPriority", input: { ticket: "4118", level: "High" } };
const PANEL: Action = { tool: "setPanel", input: { panel: "escalation", visible: true } };
const finding = (text: string): Action => ({ tool: "recordFinding", input: { text } });

const committed = (h: Harness): readonly string[] =>
  h.app.bus.records().flatMap((r) => r.commands.map((c) => c.tool));

const commandsNamed = (h: Harness, tool: string): readonly unknown[] =>
  h.app.bus.records().flatMap((r) => r.commands.filter((c) => c.tool === tool));

function rig(
  turn: TurnRunner,
  opts: { readonly policies?: readonly InputPolicy[]; readonly cancelDeadlineMs?: number } = {},
): {
  h: Harness;
  mailbox: InMemoryMailbox;
  sched: ReturnType<typeof virtualScheduler>;
  consumer: ReturnType<typeof wireConsumer>;
  failures: unknown[];
} {
  const h = harness();
  const mailbox = new InMemoryMailbox();
  const sched = virtualScheduler();
  const consumer = wireConsumer(h.app, {
    mailbox,
    scheduler: sched,
    turn,
    policies: opts.policies,
    cancelDeadlineMs: opts.cancelDeadlineMs,
  });
  const failures: unknown[] = [];
  void consumer.run().catch((e: unknown) => void failures.push(e));
  return { h, mailbox, sched, consumer, failures };
}

// ── 1. PREEMPTION — the whole claim ────────────────────────────────────────

describe("12.3 — an Interrupt preempts a turn in flight", () => {
  it("is handled at virtual t=100, when the running turn would not have finished until t=10 000", async () => {
    const startedAt = new Map<string, number>();
    const sawAbort = { value: false };
    let sched!: ReturnType<typeof virtualScheduler>;

    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        startedAt.set(message.kind, sched.now());
        switch (message.kind) {
          case "Input": {
            act(ctx, PRIORITY); // STEP 1 — committed, and it stays committed
            const elapsed = await sched.after(10_000, ctx.signal);
            // COOPERATIVE CANCELLATION, HONOURED AT A STEP BOUNDARY.
            sawAbort.value = elapsed === "aborted";
            if (elapsed === "aborted") return;
            act(ctx, finding("step 2 of the long turn")); // must never be reached
            return;
          }
          case "Interrupt":
            act(ctx, PANEL);
            return;
          case "Drain":
            return;
          default: {
            const _never: never = message;
            return _never;
          }
        }
      },
    };

    const r = rig(turn);
    sched = r.sched;

    r.mailbox.post(input("ticket-stream", perceived("ticket-stream", "4118 is angry", "k1")));
    await settle();
    expect(r.consumer.running).toBe(true);
    expect(committed(r.h)).toEqual(["setPriority"]);

    r.sched.advance(100);
    await settle();

    r.mailbox.post(interrupt("operator", "the customer is on the phone"));
    await settle();

    // ── THE CLAIM ──────────────────────────────────────────────────────────
    expect(startedAt.get("Input")).toBe(0);
    expect(startedAt.get("Interrupt")).toBe(100);
    expect(must(startedAt.get("Interrupt"))).toBeLessThan(10_000);
    expect(sched.now()).toBe(100);

    // cancellation was cooperative and the turn saw it
    expect(sawAbort.value).toBe(true);
    expect(r.consumer.outcomes[0]).toEqual({ kind: "Cancelled", by: "operator" });

    // NO INTERLEAVE: the interrupt's fold begins only after the cancelled turn
    // joined, so no record of the cancelled turn appears after it.
    expect(committed(r.h)).toEqual(["setPriority", "setPanel"]);

    // STEP-BOUNDARY DURABILITY: step 1 is still folded and its effect still
    // performed. No rollback, no compensating write.
    expect(r.h.app.boundary.state.triage.priority.get("4118")).toBe("High");
    expect(effectKinds(r.h.sink)).toEqual(["LogDecision"]);

    // and the cancelled turn's LATER step never arrives, even once its own
    // deadline passes — cancellation is not a deferral
    r.sched.advance(20_000);
    await settle();
    expect(committed(r.h)).toEqual(["setPriority", "setPanel"]);
    expect(r.failures).toEqual([]);
  });

  // ── 2. THE CONTRAST — the book's own loop, and why the test above is a test ─
  it("the book's 12.3 drain loop CANNOT do this — the same interrupt waits for the full turn", async () => {
    const startedAt = new Map<string, number>();
    const sched = virtualScheduler();
    const h = harness();
    const mailbox = new InMemoryMailbox();
    const seam: StepSeam = h.app.boundary;

    const ctxFor = (): TurnContext => ({
      staged: [],
      signal: new AbortController().signal,
      submit: (step) => void seam.onStepFinish(step),
    });

    // 12.3, transcribed: take() at the top, `await inFlight` at loop-body
    // indentation. Every mid-turn guard downstream of this shape is dead code.
    const brokenDrainLoop = async (): Promise<void> => {
      for (let i = 0; i < 2; i += 1) {
        const message = await mailbox.take(); // ← BLOCKS. Never reached mid-turn.
        const ctx = ctxFor();
        startedAt.set(message.kind, sched.now());
        if (message.kind === "Input") {
          act(ctx, PRIORITY);
          await sched.after(10_000, ctx.signal); // ← await at loop-body indentation
          act(ctx, finding("step 2 of the long turn"));
        } else {
          act(ctx, PANEL);
        }
      }
    };
    void brokenDrainLoop();

    mailbox.post(input("ticket-stream", perceived("ticket-stream", "4118 is angry", "k1")));
    await settle();
    sched.advance(100);
    await settle();
    mailbox.post(interrupt("operator", "the customer is on the phone"));
    await settle();

    // AT t=100 THE INTERRUPT HAS NOT BEEN SEEN AT ALL.
    expect(startedAt.has("Interrupt")).toBe(false);
    expect(committed(h)).toEqual(["setPriority"]);

    // It is only handled once the whole turn has run — which is what "cannot
    // preempt" means, and it is the difference the first test measures.
    sched.advance(10_000);
    await settle();
    expect(startedAt.get("Interrupt")).toBe(10_100);
    expect(committed(h)).toEqual(["setPriority", "recordFinding", "setPanel"]);
  });

  // ── 3. The same claim on the ambient timer, under vitest fake timers ───────
  it("holds with the ambient-timer Scheduler a deployment binds, virtualised by fake timers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const startedAt = new Map<string, number>();
      const h = harness();
      const mailbox = new InMemoryMailbox();
      const consumer = wireConsumer(h.app, {
        mailbox,
        scheduler: timerScheduler(),
        turn: {
          run: async (message: Message, ctx: TurnContext): Promise<void> => {
            startedAt.set(message.kind, Date.now());
            if (message.kind === "Input") {
              act(ctx, PRIORITY);
              const elapsed = await timerScheduler().after(10_000, ctx.signal);
              if (elapsed === "aborted") return;
              act(ctx, finding("step 2 of the long turn"));
              return;
            }
            act(ctx, PANEL);
          },
        },
      });
      const failures: unknown[] = [];
      void consumer.run().catch((e: unknown) => void failures.push(e));

      const flush = async (): Promise<void> => {
        for (let i = 0; i < 40; i += 1) await Promise.resolve();
      };

      mailbox.post(input("ticket-stream", perceived("ticket-stream", "4118 is angry", "k1")));
      await flush();
      await vi.advanceTimersByTimeAsync(100);
      await flush();
      mailbox.post(interrupt("operator", "the customer is on the phone"));
      await flush();

      expect(startedAt.get("Interrupt")).toBe(100);
      expect(must(startedAt.get("Interrupt")) - must(startedAt.get("Input"))).toBeLessThan(10_000);
      expect(committed(h)).toEqual(["setPriority", "setPanel"]);

      await vi.advanceTimersByTimeAsync(60_000);
      await flush();
      expect(committed(h)).toEqual(["setPriority", "setPanel"]);
      expect(failures).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── 4. The cancel deadline is REAL, and the revocation latch is what pays for it ─

describe("12.3 — the join is BOUNDED, and the abandoned turn is revoked", () => {
  it("a turn that ignores cancellation is abandoned, counted, and can no longer fold", async () => {
    const stuck = deferred();
    const late: { fire: (() => void) | null } = { fire: null };

    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind === "Input") {
          act(ctx, PRIORITY);
          // the whole point: this turn never looks at ctx.signal
          late.fire = () => act(ctx, finding("submitted after the deadline"));
          await stuck.promise;
          return;
        }
        act(ctx, PANEL);
      },
    };

    const r = rig(turn, { cancelDeadlineMs: 250 });
    r.mailbox.post(input("ticket-stream", perceived("ticket-stream", "4118 is angry", "k1")));
    await settle();
    expect(committed(r.h)).toEqual(["setPriority"]);

    r.mailbox.post(interrupt("operator", "stop"));
    await settle();
    // parked inside the bounded join: nothing has moved
    expect(committed(r.h)).toEqual(["setPriority"]);

    r.sched.advance(250);
    await settle();

    // NAMED, DEGRADED AND COUNTED — never hidden.
    const faults = commandsNamed(r.h, "noteFault");
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatchObject({
      tool: "noteFault",
      source: "ticket-stream",
      fault: "cancel deadline exceeded after 250ms — turn abandoned, its channel revoked",
    });
    // and the interrupt's turn ran anyway — the CONSUMER is bounded
    expect(committed(r.h)).toEqual(["setPriority", "noteFault", "setPanel"]);

    // THE LATCH. The abandoned turn's only channel into the system is dropped,
    // so two folds cannot interleave even when the join fails.
    const before = r.h.app.bus.records().length;
    expect(late.fire).not.toBeNull();
    late.fire?.();
    stuck.resolve();
    await settle();
    expect(r.h.app.bus.records().length).toBe(before);
    expect(committed(r.h)).toEqual(["setPriority", "noteFault", "setPanel"]);
    expect(r.failures).toEqual([]);
  });
});

// ── 5/6. The two input policies ────────────────────────────────────────────

describe("12.2 — the input policy is a closed choice, per source", () => {
  it("PERISHABLE conflates to the newest and folds the count — the model is told", async () => {
    const hold = deferred();
    const turns: string[] = [];

    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind !== "Input") return;
        turns.push(message.staged.key);
        act(ctx, finding(message.staged.body));
        if (turns.length === 1) await hold.promise;
      },
    };

    const r = rig(turn, { policies: [perishable("sensor")] });
    const post = (key: string, body: string): void =>
      r.mailbox.post(input("sensor", perceived("sensor", body, key)));

    post("a", "reading A");
    await settle();
    post("b", "reading B");
    post("c", "reading C");
    post("d", "reading D");
    await settle();

    hold.resolve();
    await settle();

    // ONE turn ran while busy, and it was the NEWEST input — B and C are gone
    expect(turns).toEqual(["a", "d"]);
    expect(r.h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual([
      "reading A",
      "reading D",
    ]);

    // …and the drop is a SIGNED COMMAND on the timeline, carrying the count
    const drops = commandsNamed(r.h, "noteDrop");
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      tool: "noteDrop",
      reason: { kind: "Conflated", source: "sensor", dropped: 2 },
    });

    // …and the reasoner is told, in its own input, on the very turn that won
    const winning = must(r.h.app.bus.records().at(-1));
    expect(winning.context.digest).toContain("2 input(s) conflated from sensor");
    expect(r.failures).toEqual([]);
  });

  it("charges a busy-drop to the source that was SHED, not to the one that shed it", async () => {
    const hold = deferred();
    const turns: string[] = [];

    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind !== "Input") return;
        turns.push(message.staged.key);
        act(ctx, finding(message.staged.body));
        if (turns.length === 1) await hold.promise;
      },
    };

    const r = rig(turn, { policies: [perishable("sensor-a"), perishable("sensor-b")] });
    r.mailbox.post(input("sensor-a", perceived("sensor-a", "A1", "a1")));
    await settle();
    // two from sensor-a get conflated against each other …
    r.mailbox.post(input("sensor-a", perceived("sensor-a", "A2", "a2")));
    r.mailbox.post(input("sensor-a", perceived("sensor-a", "A3", "a3")));
    // … then sensor-b takes the slot, which sheds sensor-a's remaining input
    r.mailbox.post(input("sensor-b", perceived("sensor-b", "B1", "b1")));
    await settle();
    hold.resolve();
    await settle();

    expect(turns).toEqual(["a1", "b1"]);
    const drops = commandsNamed(r.h, "noteDrop");
    expect(drops).toHaveLength(1);
    // TWO sensor-a inputs were shed, and the count says sensor-a — not sensor-b
    expect(drops[0]).toMatchObject({
      reason: { kind: "Conflated", source: "sensor-a", dropped: 2 },
    });
    expect(r.failures).toEqual([]);
  });

  it("DURABLE QUEUE never conflates — three inputs, three turns, in order, zero drops", async () => {
    const hold = deferred();
    const turns: string[] = [];

    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind !== "Input") return;
        turns.push(message.staged.key);
        act(ctx, finding(message.staged.body));
        if (turns.length === 1) await hold.promise;
      },
    };

    // no policy table at all: an unlisted source is DurableQueue, and that
    // default is the safe one because losing work is unrecoverable
    const r = rig(turn);
    const post = (key: string, body: string): void =>
      r.mailbox.post(input("tickets", perceived("tickets", body, key)));

    post("a", "ticket A");
    await settle();
    post("b", "ticket B");
    post("c", "ticket C");
    await settle();

    hold.resolve();
    await settle();

    expect(turns).toEqual(["a", "b", "c"]);
    expect(r.h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual([
      "ticket A",
      "ticket B",
      "ticket C",
    ]);
    expect(commandsNamed(r.h, "noteDrop")).toEqual([]);
    expect(r.failures).toEqual([]);
  });

  it("dedupes on the source key: the second delivery is refused, reported and acked", async () => {
    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind !== "Input") return;
        act(ctx, finding(message.staged.body));
        return Promise.resolve();
      },
    };

    const r = rig(turn);
    r.mailbox.post(input("tickets", perceived("tickets", "ticket A", "a")));
    await settle();
    r.mailbox.post(input("tickets", perceived("tickets", "ticket A again", "a")));
    await settle();

    expect(r.h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual(["ticket A"]);
    const drops = commandsNamed(r.h, "noteDrop");
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ reason: { kind: "Duplicate", source: "tickets", key: "a" } });
    // nothing is left leased: both were acked
    expect(r.mailbox.outstanding).toBe(0);
    expect(r.failures).toEqual([]);
  });

  it("the lease is what makes ack-after-commit mean something", async () => {
    const mailbox: Mailbox & { redeliver(): void; depth: number } = new InMemoryMailbox();
    const message = input("tickets", perceived("tickets", "ticket A", "a"));
    mailbox.post(message);

    expect(await mailbox.take()).toBe(message);
    // CRASH BEFORE THE ACK → re-delivered, not lost
    mailbox.redeliver();
    expect(mailbox.depth).toBe(1);
    expect(await mailbox.take()).toBe(message);

    // ACK (which the consumer calls only after the commit) → the crash is a no-op
    mailbox.ack(message);
    mailbox.redeliver();
    expect(mailbox.depth).toBe(0);
  });

  it("the dedupe scope SURVIVES A RESTART: committed work is refused, uncommitted work is retried", async () => {
    // The crash window 12.2's lease exists for: after the commit, before the
    // ack. An in-memory `seen` dies here — the timeline does not, and the key
    // rides the committed Perceived fixture precisely so a fresh process can
    // rebuild the scope from the bus alone.
    const attempts = new Map<string, number>();
    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind !== "Input") return;
        const n = (attempts.get(message.staged.key) ?? 0) + 1;
        attempts.set(message.staged.key, n);
        if (message.staged.key === "a") {
          act(ctx, finding("ticket A")); // COMMITTED …
          if (n === 1) throw new Error("process died after the commit");
          return;
        }
        if (n === 1) throw new Error("process died before the commit");
        act(ctx, finding("ticket B")); // … retried, and only then committed
      },
    };

    const r = rig(turn);
    r.mailbox.post(input("tickets", perceived("tickets", "ticket A", "a")));
    await settle();
    r.mailbox.post(input("tickets", perceived("tickets", "ticket B", "b")));
    await settle();

    // "a" committed then died; "b" died first. Neither was acked.
    expect(r.h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual(["ticket A"]);
    expect(r.mailbox.outstanding).toBe(2);
    r.consumer.stop();

    // THE RESTART: the broker outlives the process and re-delivers both
    // leases; the NEW consumer is seeded from the committed timeline alone.
    r.mailbox.redeliver();
    const restarted = wireConsumer(r.h.app, { mailbox: r.mailbox, scheduler: r.sched, turn });
    const failures: unknown[] = [];
    void restarted.run().catch((e: unknown) => void failures.push(e));
    await settle();

    // committed ⇒ refused, reported, acked. uncommitted ⇒ folded, exactly once.
    expect(r.h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual([
      "ticket A",
      "ticket B",
    ]);
    const drops = commandsNamed(r.h, "noteDrop");
    expect(drops.at(-1)).toMatchObject({
      reason: { kind: "Duplicate", source: "tickets", key: "a" },
    });
    expect(r.mailbox.outstanding).toBe(0);
    expect(failures).toEqual([]);
  });
});

// ── 7. 12.4 — a turn that throws degrades to a typed status ────────────────

describe("12.4 — a failed turn degrades and the consumer lives", () => {
  it("captures the cause as a typed outcome, folds it, and processes the next message", async () => {
    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind !== "Input") return;
        if (message.staged.key === "boom") throw new Error("backend timeout");
        act(ctx, finding(message.staged.body));
        return Promise.resolve();
      },
    };

    const r = rig(turn);
    r.mailbox.post(input("tickets", perceived("tickets", "explodes", "boom")));
    await settle();
    r.mailbox.post(input("tickets", perceived("tickets", "ticket B", "b")));
    await settle();

    // the exception never crossed the loop
    expect(r.failures).toEqual([]);
    expect(r.consumer.outcomes[0]).toEqual({ kind: "Threw", fault: "backend timeout" });

    // it became a SIGNED COMMAND carrying its cause …
    const faults = commandsNamed(r.h, "noteFault");
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatchObject({ source: "tickets", fault: "backend timeout" });

    // … and the next message was processed normally
    expect(r.h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual(["ticket B"]);
    // the failed item's lease is still out, so a crash re-delivers it
    expect(r.mailbox.outstanding).toBe(1);
  });
});

// ── 8. Drain DEFERS ────────────────────────────────────────────────────────

describe("12.2 — a Drain waits, finalizes, and never preempts", () => {
  it("lets the running turn finish its remaining step, then seals, then stops", async () => {
    const hold = deferred();
    const abortSeen = { value: true };

    const turn: TurnRunner = {
      run: async (message: Message, ctx: TurnContext): Promise<void> => {
        if (message.kind !== "Input") return;
        act(ctx, finding("first half"));
        await hold.promise;
        // A DRAIN NEVER CANCELS — the signal is still clear here.
        abortSeen.value = ctx.signal.aborted;
        act(ctx, finding("second half"));
      },
    };

    const r = rig(turn);
    r.mailbox.post(input("tickets", perceived("tickets", "work", "a")));
    await settle();
    expect(committed(r.h)).toEqual(["recordFinding"]);

    r.mailbox.post(drain("operator", "shift over"));
    await settle();
    // deferred, not cancelled: nothing has been finalized yet
    expect(committed(r.h)).toEqual(["recordFinding"]);

    hold.resolve();
    await settle();

    expect(abortSeen.value).toBe(false);
    expect(r.consumer.outcomes.at(-1)).toEqual({ kind: "Ok", steps: 2 });
    expect(committed(r.h)).toEqual(["recordFinding", "recordFinding", "requestSeal"]);
    expect(r.consumer.running).toBe(false);
    expect(r.failures).toEqual([]);
  });
});

// ── 9. The consumer is optional, and costs an app that never wires one nothing ─

describe("the mailbox is a rung, not a tax", () => {
  it("an app that wires no mailbox builds a boundary with no consumer at all", () => {
    const h = harness();
    const app: App = h.app;
    expect(app.boundary.state.inbox.faults).toEqual([]);
    // `wireConsumer` is a separate call; nothing in `wireApp` reaches for it.
    expect(committed(h)).toEqual([]);
  });
});
