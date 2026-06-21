// ── The boundary adapter: the one impure seam (seam 02) ─────────────────────
// The single place the pure core touches the world. It mints the clock and id,
// stamps the Actor, COMMITS to the append-only bus, adopts the new state, and
// performs effects — in that order. Nothing else in the system is impure.

import type { Actor, State } from "./domain";
import type { Command } from "./command";
import type { Effect } from "./effect";
import type { ToolResult } from "./tool-result";
import { fold } from "./fold";

// Injected capabilities — quarantined here so the core stays pure and replayable.
export interface Clock {
  now(): number;
}
export interface IdSource {
  next(): string;
}
export type PerformMode = "LIVE" | "REPLAY";
export interface Bus {
  append(commands: readonly Command[], results: readonly ToolResult[]): void;
}
export interface Sink {
  perform(effect: Effect, mode: PerformMode): void;
}

// One finished agent step: the tool results it produced, and who acted.
export interface FinishedStep {
  readonly actor: Actor;
  readonly results: readonly ToolResult[];
}

// Map a tool result to its signed command. The Actor is stamped HERE, never
// forged upstream; the id is minted HERE, never chosen by the model.
export function signCommand(result: ToolResult, by: Actor, id: string): Command {
  switch (result.kind) {
    case "PrioritySet":
      return { kind: "SetPriority", by, id, ticket: result.ticket, level: result.level };
    case "EscalationRequested":
      return { kind: "RequestEscalation", by, id, ticket: result.ticket };
    case "EscalationConfirmed":
      return { kind: "ConfirmEscalation", by, id, ticket: result.ticket };
    case "Focused":
      return { kind: "FocusTicket", by, id, ticket: result.ticket };
    default: {
      const _never: never = result;
      return _never;
    }
  }
}

export class Boundary {
  private _state: State;
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdSource,
    private readonly bus: Bus,
    private readonly sink: Sink,
    initial: State,
  ) {
    this._state = initial;
  }

  get state(): State {
    return this._state;
  }

  // The one impure method. Order is the contract: commit, then adopt, then perform.
  onStepFinish(step: FinishedStep): void {
    const now = this.clock.now(); // (1) injected clock
    const [next, effects] = fold(this._state, step.results, now); // (2) pure decision
    const signed = step.results.map((r) => signCommand(r, step.actor, this.ids.next())); // (3) stamp + mint
    this.bus.append(signed, step.results); // (4) COMMIT to the append-only log
    this._state = next; // (5) adopt the new truth
    for (const fx of effects) this.sink.perform(fx, "LIVE"); // (6) the only place effects run
  }
}

// ── A trivial in-memory bus + recorder, so a session can be replayed ─────────
import type { RecordedStep } from "./fold";

export class RecordingBus implements Bus {
  readonly commands: Command[] = [];
  readonly results: ToolResult[] = [];
  append(commands: readonly Command[], results: readonly ToolResult[]): void {
    this.commands.push(...commands);
    this.results.push(...results);
  }
}

// A clock/id pair that is deterministic, for tests and replay.
export function fixedClock(at: number): Clock {
  return { now: () => at };
}
export function sequentialIds(prefix = "c"): IdSource {
  let n = 0;
  return { next: () => `${prefix}${++n}` };
}

// Build a recorded timeline (results + the `now` each step was folded with).
export function recordStep(results: readonly ToolResult[], now: number): RecordedStep {
  return { results, now };
}
