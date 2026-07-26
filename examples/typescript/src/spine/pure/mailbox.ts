// ── spine/pure/mailbox — what can arrive while a turn is running (12.1) ─────
// ZERO I/O. Three things can be posted to a running agent, and they demand
// three DIFFERENT policies, which is why they are three variants of one sealed
// set rather than one message with a flag:
//
//   Input      a stimulus to reason about        → conflate or queue (§ policy)
//   Interrupt  "stop what you are doing"         → PREEMPT
//   Drain      "finish, then stop"               → DEFER, then finalize
//
// The parent declares `source` ONCE. Every message says where it came from,
// because the source is the key conflation counts by, the scope dedupe runs in,
// and the attribution an Interrupt or a Drain carries.

import type { SourceName } from "./ids";
import type { Perceived } from "./staged";

export type MessageKind = "Input" | "Interrupt" | "Drain";

export interface MessageBase {
  readonly kind: MessageKind;
  readonly source: SourceName;
}

/** A stimulus to reason about.
 *
 *  `staged` is typed `Perceived` — the NARROW variant, not `StagedInput`.
 *  `Recalled` has exactly one production site in the system (the consumer), so
 *  a producer cannot post a forged relay snapshot through the mailbox.
 *
 *  The dedupe key is `staged.key` — ONE field, and it lives on the value the
 *  step COMMITS, so the envelope can never dedupe on one key while the record
 *  pins another, and a restarted consumer rebuilds its dedupe scope from the
 *  timeline alone. Non-null always: the durable policy dedupes on it, the
 *  perishable policy ignores it. No nullable, no branch. */
export interface InputMessage extends MessageBase {
  readonly kind: "Input";
  readonly staged: Perceived;
}

/** PREEMPT: cancel the in-flight turn, join it, then reason about this. */
export interface InterruptMessage extends MessageBase {
  readonly kind: "Interrupt";
  readonly reason: string;
}

/** DEFER: never preempts. Wait for the running turn, then finalize, then stop. */
export interface DrainMessage extends MessageBase {
  readonly kind: "Drain";
  readonly reason: string;
}

export type Message = InputMessage | InterruptMessage | DrainMessage;

/** The discriminant as a CONSTANT, and the ONE place it is compared. A literal at
 *  every call site is a typo away from a silent false; a named guard is not. */
export const INPUT_KIND = "Input" as const;

export function isInput(message: Message): message is InputMessage {
  return message.kind === INPUT_KIND;
}

export function input(source: SourceName, staged: Perceived): InputMessage {
  return { kind: "Input", source, staged };
}

export function interrupt(source: SourceName, reason: string): InterruptMessage {
  return { kind: "Interrupt", source, reason };
}

export function drain(source: SourceName, reason: string): DrainMessage {
  return { kind: "Drain", source, reason };
}

// ── The two input policies — a CLOSED CHOICE, scoped PER SOURCE ─────────────
// Not a boolean and not a flag: newest-input-wins and never-lose-an-item are
// different contracts, and a deployment routinely has a durable ticket queue and
// a perishable sensor feed at the same time (12.2). So the policy belongs to the
// SOURCE, and the consumer is constructed with a table.
//
// THE DEFAULT IS `DurableQueue`. Conflation is opt-in, per source, always
// declared. Three reasons, in order of weight:
//
//   1. 12.2 says newest-input-wins is "exactly wrong for a durable work queue",
//      which is the flagship server-agent deployment. A default that is wrong
//      for the flagship deployment is the wrong default.
//   2. The failure modes are ASYMMETRIC. Durable-on-perishable processes stale
//      items: wasteful, observable, recoverable. Perishable-on-durable SILENTLY
//      LOSES WORK: unrecoverable, and 14.4's own catalog calls that data loss.
//   3. It matches the architecture's posture. 14.3's default-deny makes the safe
//      classification the default and forces the cheap one to be declared and
//      reviewed. `Verb` already does this; `InputPolicy` does it the same way.

export type InputPolicyKind = "Perishable" | "DurableQueue";

export interface InputPolicyBase {
  readonly kind: InputPolicyKind;
  readonly source: SourceName;
}

/** Newest-input-wins. A busy-drop conflates to the latest and FOLDS A COUNT —
 *  observable, never silent (12.2). */
export interface Perishable extends InputPolicyBase {
  readonly kind: "Perishable";
}

/** Never conflates. Dedupes on `key`, and acks only AFTER the commit, so a
 *  crash before the ack re-delivers rather than loses (12.2). */
export interface DurableQueue extends InputPolicyBase {
  readonly kind: "DurableQueue";
}

export type InputPolicy = Perishable | DurableQueue;

export function perishable(source: SourceName): Perishable {
  return { kind: "Perishable", source };
}

export function durableQueue(source: SourceName): DurableQueue {
  return { kind: "DurableQueue", source };
}

/** An unlisted source gets `DurableQueue`. Documented, not silent. */
export function policyFor(table: readonly InputPolicy[], source: SourceName): InputPolicy {
  return table.find((p) => p.source === source) ?? durableQueue(source);
}

// ── The two bounds ──────────────────────────────────────────────────────────
// 12.3's own honest caveat is that an unbounded join is exactly a hang. These
// make the bound real. Both are injectable at construction.

/** How long a PREEMPT waits for the cancelled turn before abandoning it. */
export const CANCEL_DEADLINE_MS = 250;

/** How long a DRAIN waits for the running turn before finalizing anyway. */
export const DRAIN_DEADLINE_MS = 1000;
