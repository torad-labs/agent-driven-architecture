// ── blocks/escalation/register — THE ONE PUBLIC SYMBOL (L1, I7) ────────────

import type { BlockRegistration } from "../../spine/pure/verb";
import { isEscalationResult } from "./contract";
import { escalationArm } from "./fold";
import { escalationContextLines, escalationView } from "./project";
import type { EscalationSlice } from "./slice";
import { emptyEscalationSlice, escalationSliceOf, statusOf } from "./slice";
import { escalationVerbs } from "./tools";

export const escalation = {
  name: "escalation",
  register: <S>(read: (state: S) => EscalationSlice): BlockRegistration<S> => ({
    block: "escalation",
    verbs: escalationVerbs<S>(read),
  }),
  arm: escalationArm,
  view: escalationView,
  contextLines: escalationContextLines,
  owns: isEscalationResult,
  emptySlice: emptyEscalationSlice,
  sliceOf: escalationSliceOf,
  statusOf,
} as const;

export type { EscalationCommand, EscalationEffect, EscalationResult, PageOncall } from "./contract";
export type { EscalationSlice, TicketStatus } from "./slice";
export type { EscalationRow, EscalationView } from "./project";
export type { OncallPort } from "./port";
