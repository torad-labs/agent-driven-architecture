// ── blocks/escalation/tools — the Verb table, with the gated verb ──────────
// `confirmEscalation` is `Irreversible`, and `Irreversible` CANNOT BE
// CONSTRUCTED without saying where its matching Request lives. That is 14.3's
// default-deny made structural: there is no default classification to forget,
// and the classification is a reviewed row in the registry rather than a guess.
//
// `requestedBy` reads the authority that ASKED straight off committed State —
// and it reads it from `TicketStatus`'s PARENT-DECLARED property, so it needs no
// match over the status variants and adding a fifth variant costs it nothing.
// The boundary compares that authority against the confirming one; this file
// never sees a Signature and never decides anything.

import { object, string } from "valibot";
import type { Verb } from "../../spine/pure/verb";
import { irreversible, reversible } from "../../spine/pure/verb";
import type {
  ConfirmEscalationCommand,
  ConfirmEscalationResult,
  RequestEscalationCommand,
  RequestEscalationResult,
} from "./contract";
import type { EscalationSlice } from "./slice";
import { statusOf } from "./slice";

const ticketInput = object({ ticket: string() });

export function escalationVerbs<S>(read: (state: S) => EscalationSlice): readonly Verb<S>[] {
  return [
    reversible<S, { ticket: string }, RequestEscalationResult, RequestEscalationCommand>({
      name: "requestEscalation",
      describe: "Request escalation of a ticket. Reversible; does NOT page on-call.",
      schema: ticketInput,
      run: (input) => ({ outcome: "ok", tool: "requestEscalation", ticket: input.ticket }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "requestEscalation",
        sig,
        id,
        ticket: result.ticket,
      }),
    }),
    irreversible<S, { ticket: string }, ConfirmEscalationResult, ConfirmEscalationCommand>({
      name: "confirmEscalation",
      describe: "Confirm a pending escalation. IRREVERSIBLE: this pages on-call.",
      schema: ticketInput,
      run: (input) => ({ outcome: "ok", tool: "confirmEscalation", ticket: input.ticket }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "confirmEscalation",
        sig,
        id,
        ticket: result.ticket,
      }),
      requestedBy: (state, result) => statusOf(read(state), result.ticket)?.requestedBy ?? null,
    }),
  ];
}
