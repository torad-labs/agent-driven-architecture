// ── blocks/triage/register — THE ONE PUBLIC SYMBOL (L1, I7) ────────────────
// Everything above, bundled. Nothing outside this folder names a symbol inside
// it except through `triage`; you plug the block in by registering it at the one
// composition root, and pull it out by deleting this folder plus its lines
// there.

import type { BlockRegistration } from "../../spine/pure/verb";
import { isTriageResult } from "./contract";
import { triageArm } from "./fold";
import { triageContextLines, triageView } from "./project";
import { emptyTriageSlice, triageSliceOf } from "./slice";
import { triageVerbs } from "./tools";

export const triage = {
  name: "triage",
  register: <S>(): BlockRegistration<S> => ({ block: "triage", verbs: triageVerbs<S>() }),
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
