// ── blocks/inbox/register — THE ONE PUBLIC SYMBOL (L1, I7) ─────────────────
// Six files, the standard block anatomy, no port and no adapter: this block
// holds no client handle because it records what already happened.

import type { BlockRegistration } from "../../spine/pure/verb";
import { isInboxResult } from "./contract";
import { inboxArm } from "./fold";
import { inboxContextLines, inboxView } from "./project";
import { emptyInboxSlice } from "./slice";
import { inboxVerbs } from "./tools";

export const inbox = {
  name: "inbox",
  register: <S>(): BlockRegistration<S> => ({ block: "inbox", verbs: inboxVerbs<S>() }),
  arm: inboxArm,
  view: inboxView,
  contextLines: inboxContextLines,
  owns: isInboxResult,
  emptySlice: emptyInboxSlice,
} as const;

export type { DropReason, InboxCommand, InboxResult } from "./contract";
export type { InboxRow, InboxView } from "./project";
export type { InboxFault, InboxSlice } from "./slice";
