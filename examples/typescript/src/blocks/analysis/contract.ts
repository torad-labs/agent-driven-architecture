// ── blocks/analysis/contract — the TIER RELAY's transport (11.2, 11.3) ─────
// Two verbs, one per tier, and they are ordinary verbs: same declarations, same
// signer, same blast radius as `setPriority`. Tiering is not a second mechanic.
//
//   recallAnalysis   FAST tier. Reads the snapshot the consumer already staged.
//   publishAnalysis  DEEP tier. Emits the one effect that writes to the relay.
//
// WHY A RECALLED CONCLUSION CANNOT REACH AN IRREVERSIBLE EFFECT (10.2, 11.3).
// Three facts, all carried by machinery that already ships:
//
//   1. It cannot carry an Authority. `Recall` declares `text` and `publishedAt`
//      and nothing else, and THIS FILE is under check C4 — a block's contract
//      may not name Actor, Authority or Signature. Unrepresentable, not unused.
//   2. It cannot become a pending request. An irreversible verb's `requestedBy`
//      returns an Authority read out of committed State; the analysis slice
//      stores text with no Authority field to return, and C4 denies importing
//      `authority` inside a block's tools, so one cannot be minted either.
//   3. The recall arm emits NO effect at all. `PublishConclusion` is emitted
//      only by `publishAnalysis` — the deep tier's own signed act.
//
// So an irreversible act SUGGESTED by recalled text still has to pass the
// boundary gate on its own merits, and with no pending request from a different
// principal it is Refused. Recall confers no authority; it buys the model
// nothing. Both halves of that are tested.

import type { CommandBase } from "@adr/spine/pure/command";
import type { EffectBase } from "@adr/spine/pure/effect";
import type { Recall } from "@adr/spine/pure/staged";
import type { ToolResultBase } from "@adr/spine/pure/tool-result";

// ── ToolResult cases ────────────────────────────────────────────────────────
/** Carries the whole sealed `Recall` — text AND variant. That is what makes a
 *  re-fold resolve the same snapshot AND the same branch from committed bytes
 *  alone, with no second capture log and no re-query. */
export interface RecallAnalysisResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "recallAnalysis";
  readonly recall: Recall;
}

export interface PublishAnalysisResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "publishAnalysis";
  readonly text: string;
}

export type AnalysisResult = RecallAnalysisResult | PublishAnalysisResult;

// ── Command cases ───────────────────────────────────────────────────────────
export interface RecallAnalysisCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "recallAnalysis";
  readonly recall: Recall;
}

export interface PublishAnalysisCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "publishAnalysis";
  readonly text: string;
}

export type AnalysisCommand = RecallAnalysisCommand | PublishAnalysisCommand;

// ── Effect cases ────────────────────────────────────────────────────────────
/** The deep tier's write to the relay, as an EFFECT DESCRIPTOR — so it is
 *  replay-stubbed for free and idempotency-keyed by `EffectKey` in RECOVERY,
 *  through machinery that already ships. Publishing is not a side channel. */
export interface PublishConclusion extends EffectBase {
  readonly kind: "PublishConclusion";
  readonly text: string;
}

export type AnalysisEffect = PublishConclusion;

export function isAnalysisResult(r: ToolResultBase): r is AnalysisResult {
  return r.outcome === "ok" && (r.tool === "recallAnalysis" || r.tool === "publishAnalysis");
}
