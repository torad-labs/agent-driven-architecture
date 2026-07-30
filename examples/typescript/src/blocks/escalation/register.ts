// ── blocks/escalation/register — THE ONE PUBLIC SYMBOL (G11) ───────────

import type { Handlers } from "@adr/spine/pure/effect";
import type { BlockRegistration } from "@adr/spine/pure/verb";
import type { EscalationEffect } from "./contract";
import { isEscalationResult } from "./contract";
import { escalationArm } from "./fold";
import type { OncallPort } from "./port";
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
  /** THE EFFECT HANDLERS. Registered exactly like the verbs above and for the
   *  same reason: performing a `EscalationEffect` case is this block's business, and a
   *  case this table does not answer is a compile error HERE, in the folder that
   *  owns it, rather than a missing branch at the composition root. The root
   *  binds the dependency and assembles; it names no kind but `Diag`. */
  handlers: (oncall: OncallPort): Handlers<EscalationEffect> => ({
    PageOncall: (effect) => oncall.page(effect.ticket),
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
export type { OncallPort } from "./port";
export type { EscalationRow, EscalationView } from "./project";
export type { EscalationSlice, TicketStatus } from "./slice";
