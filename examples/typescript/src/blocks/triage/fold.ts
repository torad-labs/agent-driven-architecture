// ── blocks/triage/fold — the block's ARM (F9) ──────────────────────────────
// Three rules, mechanical, no exceptions:
//   1. the arm READS CURRENT STATE before it decides;
//   2. every effect push lives INSIDE the success branch;
//   3. a rejection folds a per-item Notice — never the session-global RunStatus,
//      never a mutation.
//
// The shipped reference failed all three: setPriority on an unknown ticket
// performed an Effect.Log, committed a SetPriority command, left folded state
// UNCHANGED — a clean-looking audit record for a mutation that never happened —
// and flipped the session banner to "degraded" for the rest of the session.
//
// The match is a `never`-guarded switch over the block's own sealed sub-union,
// so a new verb here fails to compile until its arm exists.

import type { Signature } from "../../spine/pure/actor";
import type { Timestamp } from "../../spine/pure/ids";
import { rejected } from "../../spine/pure/notice";
import type { ArmOut } from "../../spine/pure/verb";
import { armOut } from "../../spine/pure/verb";
import type { LogDecision, TriageResult } from "./contract";
import type { TriageSlice } from "./slice";
import { priorityOf, ticketOf, withPriority } from "./slice";

export function triageArm(
  slice: TriageSlice,
  r: TriageResult,
  now: Timestamp,
  _sig: Signature,
): ArmOut<TriageSlice> {
  switch (r.tool) {
    case "setPriority": {
      if (ticketOf(slice, r.ticket) === null) {
        return armOut(slice, [], [rejected(now, r.tool, `unknown ticket ${r.ticket}`)]);
      }
      // the fold — not the tool — derives `supersedes` from its own state
      const effect: LogDecision = {
        kind: "LogDecision",
        at: now,
        ticket: r.ticket,
        level: r.level,
        supersedes: priorityOf(slice, r.ticket),
      };
      return armOut(withPriority(slice, r.ticket, r.level), [effect], []);
    }
    default: {
      // The guard is on the DISCRIMINANT, not the value, because this block has
      // one verb today and a one-member "union" is just an interface — which TS
      // cannot narrow to `never`. Guarding `r.tool` is total either way: add
      // `archiveTicket` to the block's contract and this line stops compiling.
      const _never: never = r.tool;
      return _never;
    }
  }
}
