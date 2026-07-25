// ── spine/pure/notice — PER-ITEM failure (F9) ───────────────────────────────
// A closed set whose parent declares all three shared fields once.
//
// The distinction this type exists to enforce: a per-item failure is NOT a
// session-level fault. The shipped reference hijacked the session-global
// RunStatus for a rejected ticket, so one bad ticket left the banner reading
// "degraded: …" for the rest of the session and no arm ever cleared it. A
// Notice lands in `SpineSlice.notices` beside the item that caused it;
// `RunStatus` stays the boundary's, for session-level causes only.

import type { Timestamp, ToolName } from "./ids";

export type NoticeKind = "Rejected" | "Refused";

export interface NoticeBase {
  readonly kind: NoticeKind;
  readonly at: Timestamp;
  readonly tool: ToolName;
  readonly reason: string;
}

/** A fold ARM refused the transition — invalid against current state (F9). */
export interface Rejected extends NoticeBase {
  readonly kind: "Rejected";
}

/** The BOUNDARY gate refused the action — not permitted (F2/F3). */
export interface RefusedNotice extends NoticeBase {
  readonly kind: "Refused";
}

export type Notice = Rejected | RefusedNotice;

export function rejected(at: Timestamp, tool: ToolName, reason: string): Rejected {
  return { kind: "Rejected", at, tool, reason };
}

export function refusedNotice(at: Timestamp, tool: ToolName, reason: string): RefusedNotice {
  return { kind: "Refused", at, tool, reason };
}

/** One line per notice, for the banner strip and for the context digest. */
export function renderNotice(n: Notice): string {
  switch (n.kind) {
    case "Rejected":
      return `rejected ${n.tool}: ${n.reason}`;
    case "Refused":
      return `refused ${n.tool}: ${n.reason}`;
    default: {
      const _never: never = n;
      return _never;
    }
  }
}
