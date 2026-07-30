// ── blocks/triage/tools — the Verb table ───────────────────────────────────
// One row per verb: name, model-facing description, input schema, the PURE run,
// the name→Command entry, and the reversibility classification. There is no
// default classification — you pick a sealed variant, which is how 14.3's
// default-deny becomes structural instead of remembered.
//
// The tool returns RAW INPUTS ONLY. It does not read state to compute
// `supersedes`, does not stamp an actor, and does not decide whether the
// transition is legal — the fold does all three (4.3's division of labour).
//
// The input schema for `ticket` is a plain string ON PURPOSE (6.10): the ticket
// set is OPEN at the boundary, and the ARM is what validates it against State.
//
// THE UPCASTER LIVES HERE, and not in contract.ts, because check C7 puts it
// here: a block mints its own ToolResults in this file and nowhere else, and
// `upcastSetPriority` produces one. The v1 SHAPE is declared next to the v2
// shape it evolved from (contract.ts); the LIFT is a production site.

import type { Verb } from "@adr/spine/pure/verb";
import { reversible } from "@adr/spine/pure/verb";
import type { InferOutput } from "valibot";
import { object, optional, picklist, string } from "valibot";
import type { SetPriorityCommand, SetPriorityResult, SetPriorityResultV1 } from "./contract";

const priority = picklist(["Low", "Normal", "High", "Urgent"]);

/** What a v1 record's missing `reason` becomes on the way into the fold (14.7).
 *  NOT `null`: `null` is v2's word for "the caller gave none", and a v1 record
 *  never had the field at all. An upcaster that erased that distinction would
 *  be inventing history rather than lifting it. */
export const PRE_V2_REASON = "not recorded (pre-v2 record)";

/** THE WORKED UPCASTER (14.7), v1 → v2 for this block's one payload.
 *
 *  Pure and total: every v1 result has exactly one v2 form. It never touches
 *  the record it came from — the caller gets a NEW value on the way into the
 *  fold, which is the difference between upcasting and the history rewrite
 *  14.1 forbids.
 *
 *  It re-mints `outcome` and `tool` rather than spreading `old`, which is not
 *  ceremony: the v1 payload's `outcome` is `"ok-v1"` — the conflict that makes
 *  a historical payload un-foldable — so the current shape has to be written
 *  out, and this function is the one place in the port that may write it. */
export function upcastSetPriority(old: SetPriorityResultV1): SetPriorityResult {
  return {
    outcome: "ok",
    tool: "setPriority",
    ticket: old.ticket,
    level: old.level,
    reason: PRE_V2_REASON,
  };
}

export function triageVerbs<S>(): readonly Verb<S>[] {
  return [
    reversible<
      S,
      { ticket: string; level: InferOutput<typeof priority>; reason?: string },
      SetPriorityResult,
      SetPriorityCommand
    >({
      name: "setPriority",
      describe: "Set a support ticket's priority (Low | Normal | High | Urgent).",
      // `reason` is the v2 field, and it is OPTIONAL at the schema too: an
      // adopter's existing callers keep working, which is the other half of
      // what 14.7's "optional field" buys.
      schema: object({ ticket: string(), level: priority, reason: optional(string()) }),
      run: (input) => ({
        outcome: "ok",
        tool: "setPriority",
        ticket: input.ticket,
        level: input.level,
        reason: input.reason ?? null,
      }),
      // The Command does NOT mirror the new field, and the asymmetry is 14.7
      // doing its job: a Command is the SIGNED record of what a principal
      // authorized, and 14.1 forbids rewriting it — so the Command shape that
      // was signed is the shape that stays. What the fold consumes is the
      // RESULT, and that is what evolves.
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "setPriority",
        sig,
        id,
        ticket: result.ticket,
        level: result.level,
      }),
    }),
  ];
}
