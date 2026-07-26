// ── blocks/console/tools — presentation verbs, ONE tool mechanic (A1) ──────
// Compare line for line with `blocks/triage/tools.ts`. Same declarations, same
// `sign` entry, same reversibility decision. The authoring discipline is
// identical (4.4) because there is only one discipline.

import { z } from "zod";
import type { Verb } from "../../spine/pure/verb";
import { reversible } from "../../spine/pure/verb";
import type {
  FocusTicketCommand,
  FocusTicketResult,
  SetPanelCommand,
  SetPanelResult,
} from "./contract";

export function consoleVerbs<S>(): readonly Verb<S>[] {
  return [
    reversible<S, { ticket: string }, FocusTicketResult, FocusTicketCommand>({
      name: "focusTicket",
      describe: "Bring a ticket into focus on the console.",
      schema: z.object({ ticket: z.string() }),
      run: (input) => ({ outcome: "ok", tool: "focusTicket", ticket: input.ticket }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "focusTicket",
        sig,
        id,
        ticket: result.ticket,
      }),
    }),
    reversible<S, { panel: string; visible: boolean }, SetPanelResult, SetPanelCommand>({
      name: "setPanel",
      describe: "Show or hide a console panel (e.g. 'escalation', 'findings').",
      schema: z.object({ panel: z.string(), visible: z.boolean() }),
      run: (input) => ({
        outcome: "ok",
        tool: "setPanel",
        panel: input.panel,
        visible: input.visible,
      }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "setPanel",
        sig,
        id,
        panel: result.panel,
        visible: result.visible,
      }),
    }),
  ];
}
