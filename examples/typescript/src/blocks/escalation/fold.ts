// ── blocks/escalation/fold — the block's ARM (F9) ──────────────────────────
// CONSUMER 1 of 3 of the sealed `TicketStatus`. Adding a fifth variant fails to
// compile here, and the compiler names the file and the line — which is the
// edit list 15.4 promises and the shipped reference could not produce.
//
// Note what the arm does NOT do: it does not decide who may confirm. The
// boundary already refused a self-confirm and a confirm with no pending
// request, and committed that verdict as `ToolResult.Refused`. What the arm
// does is validate the transition against ITS OWN slice, and emit the
// irreversible effect only from the success branch.

import type { Signature } from "../../spine/pure/actor";
import type { Timestamp } from "../../spine/pure/ids";
import { rejected } from "../../spine/pure/notice";
import type { ArmOut } from "../../spine/pure/verb";
import { armOut } from "../../spine/pure/verb";
import type { EscalationResult, PageOncall } from "./contract";
import type { EscalationSlice, TicketStatus } from "./slice";
import { escalated, escalating, statusOf, withStatus } from "./slice";

export function escalationArm(
  slice: EscalationSlice,
  r: EscalationResult,
  now: Timestamp,
  sig: Signature,
): ArmOut<EscalationSlice> {
  switch (r.tool) {
    case "requestEscalation": {
      const status = statusOf(slice, r.ticket);
      if (status === null) {
        return armOut(slice, [], [rejected(now, r.tool, `unknown ticket ${r.ticket}`)]);
      }
      if (!canRequest(status)) {
        return armOut(slice, [], [rejected(now, r.tool, `ticket ${r.ticket} is ${status.kind}`)]);
      }
      // a request is REVERSIBLE — no irreversible effect fires here
      return armOut(withStatus(slice, escalating(r.ticket, sig.authority)), [], []);
    }
    case "confirmEscalation": {
      const status = statusOf(slice, r.ticket);
      if (status === null) {
        return armOut(slice, [], [rejected(now, r.tool, `unknown ticket ${r.ticket}`)]);
      }
      // Reads the PARENT-DECLARED property, not a variant match — which is why
      // this arm has exactly ONE status match (`canRequest`, below) and a fifth
      // TicketStatus variant costs it exactly one edit, not two.
      if (status.requestedBy === null) {
        return armOut(
          slice,
          [],
          [rejected(now, r.tool, `ticket ${r.ticket} has no pending request`)],
        );
      }
      const page: PageOncall = { kind: "PageOncall", at: now, ticket: r.ticket };
      return armOut(withStatus(slice, escalated(r.ticket, sig.authority)), [page], []);
    }
    default: {
      const _never: never = r;
      return _never;
    }
  }
}

// The closed match 15.4 asks for: not `status.kind === "Open"`, but every
// variant answered, with a `never` guard so a fifth one cannot slip past.
function canRequest(status: TicketStatus): boolean {
  switch (status.kind) {
    case "Open":
      return true;
    case "Escalating":
    case "Escalated":
    case "Resolved":
      return false;
    default: {
      const _never: never = status;
      return _never;
    }
  }
}
