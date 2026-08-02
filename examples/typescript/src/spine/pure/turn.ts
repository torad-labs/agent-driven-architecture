// ── spine/pure/turn — how a turn ENDS, and what the consumer must report ────
// ZERO I/O. Two sealed sets, both consumed with `never`-guarded matches.
//
// `TurnOutcome` is 12.4 made typed: a turn that throws does not kill the
// consumer and does not vanish. It DEGRADES to a status carrying its cause, the
// consumer folds that cause, and the next message is processed. The consumer is
// the heartbeat and it does not stop.
//
// `ConsumerEvent` is what the consumer must SAY OUT LOUD. Every one of these is
// a decision the system took on the operator's behalf — a dropped input, a
// duplicate refused, a turn that failed, a cancel that timed out — and 12.2's
// "observable, never silent" is only true if each one travels the ordinary path:
// resolveAction → gate → fold → commit → signed Command. Reporting is therefore
// a REQUIRED consumer parameter, which is default-deny applied to observability.

import type { SourceKey, SourceName } from "./ids";

// ── How a turn ended ────────────────────────────────────────────────────────

export type TurnOutcomeKind = "Ok" | "Threw" | "Cancelled" | "Idle";

export interface TurnOutcomeBase {
  readonly kind: TurnOutcomeKind;
}

export interface TurnOk extends TurnOutcomeBase {
  readonly kind: "Ok";
  readonly steps: number;
}

/** The turn threw. The CONSUMER LIVES (12.4) — the exception never crosses the
 *  loop, because the turn runner captures it into this variant. */
export interface TurnThrew extends TurnOutcomeBase {
  readonly kind: "Threw";
  readonly fault: string;
}

/** Preempted at a step boundary. Steps that completed before the cancel stay
 *  durably folded and their effects stay performed — there is no rollback. */
export interface TurnCancelled extends TurnOutcomeBase {
  readonly kind: "Cancelled";
  readonly by: SourceName;
}

/** "Nothing to do" is not a failure. */
export interface TurnIdle extends TurnOutcomeBase {
  readonly kind: "Idle";
}

export type TurnOutcome = TurnOk | TurnThrew | TurnCancelled | TurnIdle;

export function turnOk(steps: number): TurnOk {
  return { kind: "Ok", steps };
}

export function turnThrew(fault: string): TurnThrew {
  return { kind: "Threw", fault };
}

export function turnCancelled(by: SourceName): TurnCancelled {
  return { kind: "Cancelled", by };
}

export const turnIdle: TurnIdle = { kind: "Idle" };

// ── What the consumer must never swallow ────────────────────────────────────

export type ConsumerEventKind = "Conflated" | "Duplicate" | "TurnFailed" | "CancelDeadlineExceeded";

export interface ConsumerEventBase {
  readonly kind: ConsumerEventKind;
  readonly source: SourceName;
}

/** A busy-drop on a perishable source. `dropped` is the count folded into the
 *  turn that finally ran — so the reasoner is told it is shedding load. */
export interface Conflated extends ConsumerEventBase {
  readonly kind: "Conflated";
  readonly dropped: number;
}

/** A durable source re-delivered an item already committed. */
export interface Duplicate extends ConsumerEventBase {
  readonly kind: "Duplicate";
  readonly key: SourceKey;
}

export interface TurnFailed extends ConsumerEventBase {
  readonly kind: "TurnFailed";
  readonly fault: string;
}

/** The cancelled turn did not settle inside its bound, so it was ABANDONED:
 *  its channel into the system was revoked and the new turn started anyway.
 *  Named, degraded and counted — never hidden. */
export interface CancelDeadlineExceeded extends ConsumerEventBase {
  readonly kind: "CancelDeadlineExceeded";
  readonly afterMs: number;
}

export type ConsumerEvent = Conflated | Duplicate | TurnFailed | CancelDeadlineExceeded;

export function conflated(source: SourceName, dropped: number): Conflated {
  return { kind: "Conflated", source, dropped };
}

export function duplicate(source: SourceName, key: SourceKey): Duplicate {
  return { kind: "Duplicate", source, key };
}

export function turnFailed(source: SourceName, fault: string): TurnFailed {
  return { kind: "TurnFailed", source, fault };
}

export function cancelDeadlineExceeded(
  source: SourceName,
  afterMs: number,
): CancelDeadlineExceeded {
  return { kind: "CancelDeadlineExceeded", source, afterMs };
}
