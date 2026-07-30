// ── blocks/triage/register — THE ONE PUBLIC SYMBOL (G11) ───────────────
// Everything above, bundled. Nothing outside this folder names a symbol inside
// it except through `triage`; you plug the block in by registering it at the one
// composition root, and pull it out by deleting this folder plus its lines
// there.

import type { Handlers } from "@adr/spine/pure/effect";
import type { Emit } from "@adr/spine/pure/emit";
import type { BlockRegistration } from "@adr/spine/pure/verb";
import type { TriageEffect } from "./contract";
import { isTriageResult } from "./contract";
import { triageArm } from "./fold";
import { triageContextLines, triageView } from "./project";
import { emptyTriageSlice, triageSliceOf } from "./slice";
import { triageVerbs } from "./tools";

export const triage = {
  name: "triage",
  register: <S>(): BlockRegistration<S> => ({ block: "triage", verbs: triageVerbs<S>() }),
  /** THE EFFECT HANDLERS. Registered exactly like the verbs above and for the
   *  same reason: performing a `TriageEffect` case is this block's business, and a
   *  case this table does not answer is a compile error HERE, in the folder that
   *  owns it, rather than a missing branch at the composition root. The root
   *  binds the dependency and assembles; it names no kind but `Diag`. */
  handlers: (log: Emit): Handlers<TriageEffect> => ({
    LogDecision: (effect) =>
      log(
        `[decision @${effect.at}] ${effect.ticket} → ${effect.level}` +
          (effect.supersedes === null ? "" : ` (was ${effect.supersedes})`),
      ),
  }),
  arm: triageArm,
  view: triageView,
  contextLines: triageContextLines,
  owns: isTriageResult,
  emptySlice: emptyTriageSlice,
  sliceOf: triageSliceOf,
} as const;

export type { Priority, TriageCommand, TriageEffect, TriageResult } from "./contract";
export type { TriageRow, TriageView } from "./project";
export type { Ticket, TriageSlice } from "./slice";
