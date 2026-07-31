// ── blocks/escalation/contract — the block's TRANSPORT (G12) ───────────────
// Two verbs, one reversible and one not; identical declarations otherwise.
// No Actor, no Authority, no Signature anywhere in this file (check C4) — the
// Command's `sig` is declared on the spine's parent, and a ToolResult never
// carries an actor at all, which is what makes one unforgeable upstream.

import type { CommandBase } from "@adr/spine/pure/command";
import type { EffectBase } from "@adr/spine/pure/effect";
import type { TicketId } from "@adr/spine/pure/ids";
import type { ToolResultBase } from "@adr/spine/pure/tool-result";

// ── ToolResult cases ────────────────────────────────────────────────────────
export interface RequestEscalationResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "requestEscalation";
  readonly ticket: TicketId;
}

export interface ConfirmEscalationResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "confirmEscalation";
  readonly ticket: TicketId;
}

export type EscalationResult = RequestEscalationResult | ConfirmEscalationResult;

// ── Command cases ───────────────────────────────────────────────────────────
export interface RequestEscalationCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "requestEscalation";
  readonly ticket: TicketId;
}

export interface ConfirmEscalationCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "confirmEscalation";
  readonly ticket: TicketId;
}

export type EscalationCommand = RequestEscalationCommand | ConfirmEscalationCommand;

// ── Effect cases ────────────────────────────────────────────────────────────
/** IRREVERSIBLE. It fires only from the success branch of the confirm arm, and
 *  only after the boundary gate admitted the confirm. */
export interface PageOncall extends EffectBase {
  readonly kind: "PageOncall";
  /** IRREVERSIBLE: a human is woken. Declared as a LITERAL, so no arm can spell
   *  this leaf `Routine` (docs/DECISIONS.md:85). */
  readonly effectClass: "Irreversible";
  readonly ticket: TicketId;
}

export type EscalationEffect = PageOncall;

export function isEscalationResult(r: ToolResultBase): r is EscalationResult {
  return r.outcome === "ok" && (r.tool === "requestEscalation" || r.tool === "confirmEscalation");
}
