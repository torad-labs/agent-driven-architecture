// ── The fold: the Use-Case Interactor (seam 01) ─────────────────────────────
// Pure. A function of (state, results, now). Returns (newState, effects).
// It RETURNS effect descriptors; it never performs them. `now` is injected, so
// the same recorded input always re-folds to the same output (replay).

import type { State } from "./domain";
import { withFocus, withPriority, withStatus, withUnhandled } from "./domain";
import type { Effect } from "./effect";
import type { ToolResult } from "./tool-result";

export function fold(
  state: State,
  results: readonly ToolResult[],
  now: number,
): readonly [State, Effect[]] {
  let s = state;
  const fx: Effect[] = [];
  for (const r of results) {
    switch (r.kind) {
      case "PrioritySet":
        s = withPriority(s, r.ticket, r.level);
        fx.push({ kind: "Log", what: "priority", ticket: r.ticket, level: r.level, at: now });
        break;
      case "EscalationRequested":
        // a request is reversible — no irreversible effect fires
        s = withStatus(s, r.ticket, { kind: "Escalating", by: r.by });
        break;
      case "EscalationConfirmed":
        // THE GATE: the irreversible page fires only for a separate authority.
        // The actor was minted at the boundary, so an agent-issued confirm
        // carries `Agent` and cannot reach PageOncall.
        if (r.by === "Human") {
          s = withStatus(s, r.ticket, { kind: "Escalated" });
          fx.push({ kind: "PageOncall", ticket: r.ticket, at: now });
        } else {
          fx.push({ kind: "Diag", note: "denied: agent self-confirm" });
        }
        break;
      case "Focused":
        // a UI tool folds into UI state only — no domain effect
        s = withFocus(s, r.ticket);
        break;
      default: {
        // exhaustiveness: the compiler proves every variant is handled (G12).
        const _never: never = r;
        void _never;
        s = withUnhandled(s, "unhandled tool result");
      }
    }
  }
  return [s, fx];
}

export interface RecordedStep {
  readonly results: readonly ToolResult[];
  readonly now: number;
}

// Fold a recorded timeline step by step. `foldAll` is just `fold` iterated.
export function foldAll(
  initial: State,
  recorded: readonly RecordedStep[],
): readonly [State, Effect[]] {
  let s = initial;
  const all: Effect[] = [];
  for (const step of recorded) {
    const [next, fx] = fold(s, step.results, step.now);
    s = next;
    all.push(...fx);
  }
  return [s, all];
}
