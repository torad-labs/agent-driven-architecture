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

import { z } from "zod";
import type { Verb } from "../../spine/pure/verb";
import { reversible } from "../../spine/pure/verb";
import type { SetPriorityCommand, SetPriorityResult } from "./contract";

const priority = z.enum(["Low", "Normal", "High", "Urgent"]);

export function triageVerbs<S>(): readonly Verb<S>[] {
  return [
    reversible<S, { ticket: string; level: z.infer<typeof priority> }, SetPriorityResult, SetPriorityCommand>({
      name: "setPriority",
      describe: "Set a support ticket's priority (Low | Normal | High | Urgent).",
      schema: z.object({ ticket: z.string(), level: priority }),
      run: (input) => ({ outcome: "ok", tool: "setPriority", ticket: input.ticket, level: input.level }),
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
