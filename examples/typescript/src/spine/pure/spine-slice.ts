// ── spine/pure/spine-slice — the spine's own slice of State ─────────────────
// Two fields with two different scopes, and keeping them apart is the whole of
// F9's structural fix:
//
//   run      SESSION-GLOBAL. Only the boundary writes it.
//   notices  PER-ITEM. Every arm writes here when it refuses a transition.
//
// The spine also owns the two arms that are identical in every application:
// Unhandled and Refused. Both fold a diagnostic and a notice — and NO domain
// transition and NO irreversible effect.

import type { EffectBase } from "./effect";
import { diag } from "./effect";
import type { Timestamp, ToolName } from "./ids";
import type { Notice } from "./notice";
import { refusedNotice, rejected } from "./notice";
import type { RunStatus } from "./run-status";
import { idle } from "./run-status";
import type { SpineResult } from "./tool-result";
import type { ArmOut } from "./verb";

export interface SpineSlice {
  readonly run: RunStatus;
  readonly notices: readonly Notice[];
}

export const emptySpineSlice: SpineSlice = { run: idle, notices: [] };

export function withRun(slice: SpineSlice, run: RunStatus): SpineSlice {
  return { ...slice, run };
}

export function withNotices(slice: SpineSlice, notices: readonly Notice[]): SpineSlice {
  return notices.length === 0 ? slice : { ...slice, notices: [...slice.notices, ...notices] };
}

/**
 * The floor under block dispatch: a result no block claimed (§6.5).
 *
 * `foldOk`'s ownership chain is type predicates, and TypeScript TRUSTS a
 * predicate it cannot verify — so a block whose `owns` has gone stale narrows
 * the result to `never` at compile time while a real value flows through at
 * runtime. Returning that `never` returned `undefined`, and the caller died on
 * `out.effects is not iterable`: a crash out of the one arm 6.5 says must never
 * crash.
 *
 * This is that arm, obeying 6.5 like every other — total AND observable. It
 * folds no transition, emits a diagnostic, and leaves a per-item notice naming
 * the tool, exactly as an unknown tool name does. The fold does not mint a
 * ToolResult to get here (C7 forbids that, correctly); it asks the spine.
 */
export function unclaimedArm(slice: SpineSlice, tool: ToolName, now: Timestamp): ArmOut<SpineSlice> {
  const note = "no block claimed this result — a block's `owns` predicate is stale";
  const effects: readonly EffectBase[] = [diag(now, note)];
  return { slice, effects, notices: [rejected(now, tool, note)] };
}

/** The spine-owned arms, identical in every application (§7). */
export function spineArm(slice: SpineSlice, r: SpineResult, now: Timestamp): ArmOut<SpineSlice> {
  switch (r.outcome) {
    case "unhandled": {
      const effects: readonly EffectBase[] = [diag(now, r.note)];
      return { slice, effects, notices: [rejected(now, r.tool, r.note)] };
    }
    case "refused": {
      const effects: readonly EffectBase[] = [diag(now, r.reason)];
      return { slice, effects, notices: [refusedNotice(now, r.tool, r.reason)] };
    }
    default: {
      const _never: never = r;
      return _never;
    }
  }
}
