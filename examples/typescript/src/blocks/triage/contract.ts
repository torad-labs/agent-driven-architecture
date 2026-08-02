// ── blocks/triage/contract — the block's TRANSPORT (G12) ───────────────────
// Every case this block contributes to the three spine-rooted sealed sets. The
// shared fields are declared ONCE, on the spine's base interfaces; a variant
// here declares only what is its own.
//
// 6.8 in one line: `tool` is the discriminant of the ToolResult, the discriminant
// of the Command, and the registry key. One name per verb.
//
// This file may not name Actor, Authority or Signature (check C4). It does not
// need to: the Command's `sig` is declared on the parent.

import type { CommandBase } from "@adr/spine/pure/command";
import type { EffectBase } from "@adr/spine/pure/effect";
import type { TicketId } from "@adr/spine/pure/ids";
import type { ToolResultBase } from "@adr/spine/pure/tool-result";
import { claims } from "@adr/spine/pure/tool-result";

export type Priority = "Low" | "Normal" | "High" | "Urgent";

// ── ToolResult cases ────────────────────────────────────────────────────────
export interface SetPriorityResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "setPriority";
  readonly ticket: TicketId;
  readonly level: Priority;
  /** v2 of this payload (14.7). OPTIONAL in the schema sense — the caller may
   *  give none — and spelled as an explicit `null` rather than an absent key,
   *  so every construction site has to decide instead of forgetting. */
  readonly reason: string | null;
}

export type TriageResult = SetPriorityResult;

/** THE v1 PAYLOAD (14.7) — what `setPriority` returned before `reason` existed.
 *
 *  It is a HISTORICAL shape, so it is deliberately not part of `TriageResult`:
 *  nothing can fold it, sign it or commit it, and the only thing that may read
 *  it is the upcaster in this block's tools.ts — which is where a block mints
 *  its results (check C7) and therefore the only legal home for a function
 *  whose output is one.
 *
 *  `outcome` IS THE REFUSAL, and it is spelled `"ok-v1"` on purpose. TypeScript
 *  is structural: a historical payload that merely ADDS a marker field would
 *  still satisfy `ToolResultBase` — an extra property never blocks assignability
 *  to a supertype — so `{ ...v1Record, schemaVersion: SCHEMA_VERSION }` would
 *  typecheck and re-fold, producing a v2 envelope over v1 payloads and a
 *  `reason` of `undefined` that neither declared type admits. The only shape a
 *  structural language refuses is a CONFLICT on an inherited member, so the
 *  discriminant carries a value `ResultOutcome` does not have. The Kotlin port
 *  gets this for free by not extending `ToolResult`; this is what makes the two
 *  ports equal in GUARANTEE and not merely in component count.
 *
 *  ABSENCE IS NOT `null`. A v1 record had no field at all; a v2 record with
 *  `reason: null` says a caller supplied none. Those are different facts, and
 *  conflating them is how an upcaster quietly invents history — so the
 *  upcaster fills the one value only it can know. */
export interface SetPriorityResultV1 {
  readonly outcome: "ok-v1";
  readonly tool: "setPriority";
  readonly ticket: TicketId;
  readonly level: Priority;
}

// ── Command cases ───────────────────────────────────────────────────────────
export interface SetPriorityCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "setPriority";
  readonly ticket: TicketId;
  readonly level: Priority;
}

export type TriageCommand = SetPriorityCommand;

// ── Effect cases ────────────────────────────────────────────────────────────
// `at` is declared on the spine's parent, so this effect carries a timestamp by
// construction — nobody had to remember. `supersedes` is derived BY THE FOLD
// from its own current state (4.3), never by the tool.
export interface LogDecision extends EffectBase {
  readonly kind: "LogDecision";
  /** ROUTINE: a line in a decision log, replayed and re-driven at no cost. */
  readonly effectClass: "Routine";
  readonly ticket: TicketId;
  readonly level: Priority;
  readonly supersedes: Priority | null;
  /** Carried through from the result, which is what makes the v2 field
   *  OBSERVABLE on the replay path: re-folding an upcast v1 log produces a
   *  different effect sequence from re-folding a v2 one. A field no fold reads
   *  would make its upcaster untestable by construction. */
  readonly reason: string | null;
}

export type TriageEffect = LogDecision;

/** WHICH RESULTS THIS BLOCK'S ARM FOLDS, derived rather than written. The table
 *  is a mapped type over the union above (`spine/pure/tool-result`), so a case
 *  added there and a case claimed here are ONE edit: omit it and the property is
 *  missing, name a tool the union does not declare and the property is excess.
 *  The under-claiming predicate this used to be — green build, stale clause,
 *  fall-through at run time — is not writable in this form.
 *
 *  The root still dispatches on this, so a new VERB costs nothing there; only a
 *  new BLOCK does (16.1). */
export const isTriageResult = claims<TriageResult>({ setPriority: true });
