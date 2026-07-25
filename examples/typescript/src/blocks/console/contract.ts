// ── blocks/console/contract — A PRESENTATION BLOCK'S TRANSPORT (A1) ────────
// Read this beside `blocks/triage/contract.ts`. They are the same file with
// different nouns.
//
// 6.8's "a UI tool folds, does not sign" carve-out is DELETED. An agent that can
// show/hide, reposition and restructure the interface — auditably and
// replayably — is a primary advantage of this architecture, and unsigning UI
// tools removes exactly that. `focusTicket` and `setPanel` are Command cases
// with the same shape, the same signer, the same commit path and the same blast
// radius as `setPriority`. There is no second table and no apologetic caption.
//
// The axis is 4.6's, and 4.6 is untouched: a DECISION about presentation is an
// authored act — it folds and signs. EPHEMERAL local view-state (hover, scroll
// offset, unsubmitted text) never enters a tool; it lives in `view-state.ts`.
// "Why did the escalation button disappear?" is a question a human needs
// answered, so the answer is on the bus.

import type { CommandBase } from "../../spine/pure/command";
import type { PanelId, TicketId } from "../../spine/pure/ids";
import type { ToolResultBase } from "../../spine/pure/tool-result";

// ── ToolResult cases ────────────────────────────────────────────────────────
export interface FocusTicketResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "focusTicket";
  readonly ticket: TicketId;
}

export interface SetPanelResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "setPanel";
  readonly panel: PanelId;
  readonly visible: boolean;
}

export type ConsoleResult = FocusTicketResult | SetPanelResult;

// ── Command cases ───────────────────────────────────────────────────────────
export interface FocusTicketCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "focusTicket";
  readonly ticket: TicketId;
}

export interface SetPanelCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "setPanel";
  readonly panel: PanelId;
  readonly visible: boolean;
}

export type ConsoleCommand = FocusTicketCommand | SetPanelCommand;

// This block contributes NO effect case. That is a property of these particular
// verbs (a layout decision is truth, not an outside-world action), not of
// presentation blocks in general.

export function isConsoleResult(r: ToolResultBase): r is ConsoleResult {
  return r.outcome === "ok" && (r.tool === "focusTicket" || r.tool === "setPanel");
}
