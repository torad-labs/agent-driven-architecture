// ── blocks/inbox/fold — the block's ARM (F9) ───────────────────────────────
// Two `never`-guarded matches, nested: one over the block's own verbs, one over
// its own sealed `DropReason`. Adding a third drop reason breaks the build here
// and in `project.ts`, and nowhere outside this folder.

import type { Signature } from "../../spine/pure/actor";
import type { Timestamp } from "../../spine/pure/ids";
import type { ArmOut } from "../../spine/pure/verb";
import { armOut } from "../../spine/pure/verb";
import type { DropReason, InboxResult } from "./contract";
import type { InboxSlice } from "./slice";
import { withConflated, withDuplicate, withFault } from "./slice";

export function inboxArm(
  slice: InboxSlice,
  r: InboxResult,
  now: Timestamp,
  _sig: Signature,
): ArmOut<InboxSlice> {
  switch (r.tool) {
    case "noteDrop":
      return armOut(applyDrop(slice, r.reason), [], []);
    case "noteFault":
      return armOut(withFault(slice, { at: now, source: r.source, fault: r.fault }), [], []);
    default: {
      const _never: never = r;
      return _never;
    }
  }
}

function applyDrop(slice: InboxSlice, reason: DropReason): InboxSlice {
  switch (reason.kind) {
    case "Conflated":
      return withConflated(slice, reason.source, reason.dropped);
    case "Duplicate":
      return withDuplicate(slice, reason.source);
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}
