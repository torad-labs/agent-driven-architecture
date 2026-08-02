// ── blocks/inbox/contract — WHAT THE MAILBOX SHED, as folded truth ─────────
// 12.2 requires a busy-drop to be OBSERVABLE, never silent. That requirement is
// met here rather than in the spine, and the split is deliberate:
//
//   the MACHINERY   is spine — generic, swappable behind a contract (8.5 names
//                   "the concurrency / ordering policy of the mailbox" already).
//   the OBSERVABILITY is product state — it has a slice, a view, a context
//                   projection and a blast radius, which is the definition of a
//                   block (4.5–4.7).
//
// Putting the counter in a block is what keeps the core-path cost at ZERO: the
// spine's own sealed sets do not grow, `app/assemble`'s spine arms do not grow,
// and an app that never wires a consumer never compiles this block.
//
// `DropReason` is the block's OWN closed set. The spine's `ConsumerEvent` and
// this are two separate sealed sets joined at the root by `app/wire`'s report
// mapping — G11-correct: the spine does not name the block, and the block does
// not name the consumer.

import type { CommandBase } from "@adr/spine/pure/command";
import type { SourceKey, SourceName } from "@adr/spine/pure/ids";
import type { ToolResultBase } from "@adr/spine/pure/tool-result";
import { claims } from "@adr/spine/pure/tool-result";

export type DropReasonKind = "Conflated" | "Duplicate";

export interface DropReasonBase {
  readonly kind: DropReasonKind;
  readonly source: SourceName;
}

/** Newest-input-wins shed N older inputs on a perishable source. */
export interface ConflatedDrop extends DropReasonBase {
  readonly kind: "Conflated";
  readonly dropped: number;
}

/** A durable queue re-delivered an item that was already committed. */
export interface DuplicateDrop extends DropReasonBase {
  readonly kind: "Duplicate";
  readonly key: SourceKey;
}

export type DropReason = ConflatedDrop | DuplicateDrop;

// ── ToolResult cases ────────────────────────────────────────────────────────
export interface NoteDropResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "noteDrop";
  readonly reason: DropReason;
}

export interface NoteFaultResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "noteFault";
  readonly source: SourceName;
  readonly fault: string;
}

export type InboxResult = NoteDropResult | NoteFaultResult;

// ── Command cases ───────────────────────────────────────────────────────────
export interface NoteDropCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "noteDrop";
  readonly reason: DropReason;
}

export interface NoteFaultCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "noteFault";
  readonly source: SourceName;
  readonly fault: string;
}

export type InboxCommand = NoteDropCommand | NoteFaultCommand;

// This block contributes NO effect case. A drop is truth to be recorded, not an
// action on the outside world.

/** WHICH RESULTS THIS BLOCK'S ARM FOLDS, derived rather than written. The table
 *  is a mapped type over the union above (`spine/pure/tool-result`), so a case
 *  added there and a case claimed here are ONE edit: omit it and the property is
 *  missing, name a tool the union does not declare and the property is excess.
 *  The under-claiming predicate this used to be — green build, stale clause,
 *  fall-through at run time — is not writable in this form. */
export const isInboxResult = claims<InboxResult>({ noteDrop: true, noteFault: true });
