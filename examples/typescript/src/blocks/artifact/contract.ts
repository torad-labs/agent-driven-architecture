// ── blocks/artifact/contract — the work product's TRANSPORT (G16) ──────────
// The artifact was built by PERFORMED EFFECTS, which replay stubs — so 2.2's
// "the folded, replayable result of the session" was false, and a reducer
// change that corrupted artifact content while leaving State byte-identical
// passed every check on offer.
//
// Here the artifact IS State. `recordFinding` folds a line. Delivery is ONE
// irreversible effect at seal time, gated by G6 exactly as 14.3 says session-end
// is — not one effect per line performed as you go.

import type { CommandBase } from "@adr/spine/pure/command";
import type { EffectBase } from "@adr/spine/pure/effect";
import type { ToolResultBase } from "@adr/spine/pure/tool-result";
import type { ArtifactLine } from "./slice";

// ── ToolResult cases ────────────────────────────────────────────────────────
export interface RecordFindingResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "recordFinding";
  readonly text: string;
}

export interface RequestSealResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "requestSeal";
}

export interface ConfirmSealResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "confirmSeal";
}

export type ArtifactResult = RecordFindingResult | RequestSealResult | ConfirmSealResult;

// ── Command cases ───────────────────────────────────────────────────────────
export interface RecordFindingCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "recordFinding";
  readonly text: string;
}

export interface RequestSealCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "requestSeal";
}

export interface ConfirmSealCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "confirmSeal";
}

export type ArtifactCommand = RecordFindingCommand | RequestSealCommand | ConfirmSealCommand;

// ── Effect cases ────────────────────────────────────────────────────────────
/** IRREVERSIBLE, and it fires EXACTLY ONCE, at seal. The lines it carries are a
 *  value copied out of committed State, so what was delivered is what replay
 *  re-derives. */
export interface DeliverArtifact extends EffectBase {
  readonly kind: "DeliverArtifact";
  /** IRREVERSIBLE: the work product leaves the system. Its verb `confirmSeal` is
   *  the registry's other `Irreversible` row — the same fact stated at the other
   *  end of the same step (docs/DECISIONS.md:85). */
  readonly effectClass: "Irreversible";
  readonly lines: readonly ArtifactLine[];
}

export type ArtifactEffect = DeliverArtifact;

export function isArtifactResult(r: ToolResultBase): r is ArtifactResult {
  return (
    r.outcome === "ok" &&
    (r.tool === "recordFinding" || r.tool === "requestSeal" || r.tool === "confirmSeal")
  );
}
