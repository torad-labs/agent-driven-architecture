// ── blocks/triage/contract — the block's TRANSPORT (L3) ────────────────────
// Every case this block contributes to the three spine-rooted sealed sets. The
// shared fields are declared ONCE, on the spine's base interfaces; a variant
// here declares only what is its own.
//
// D3 in one line: `tool` is the discriminant of the ToolResult, the discriminant
// of the Command, and the registry key. One name per verb.
//
// This file may not name Actor, Authority or Signature (check C4). It does not
// need to: the Command's `sig` is declared on the parent.

import type { CommandBase } from "../../spine/pure/command";
import type { EffectBase } from "../../spine/pure/effect";
import type { TicketId } from "../../spine/pure/ids";
import type { ToolResultBase } from "../../spine/pure/tool-result";

export type Priority = "Low" | "Normal" | "High" | "Urgent";

// ── ToolResult cases ────────────────────────────────────────────────────────
export interface SetPriorityResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "setPriority";
  readonly ticket: TicketId;
  readonly level: Priority;
}

export type TriageResult = SetPriorityResult;

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
  readonly ticket: TicketId;
  readonly level: Priority;
  readonly supersedes: Priority | null;
}

export type TriageEffect = LogDecision;

/** Which results this block's arm folds. The root dispatches on this, so a new
 *  VERB costs nothing at the root — only a new BLOCK does (L5). */
export function isTriageResult(r: ToolResultBase): r is TriageResult {
  return r.outcome === "ok" && r.tool === "setPriority";
}
