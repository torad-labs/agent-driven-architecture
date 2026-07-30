// ── blocks/triage/project — TWO pure projections of the same slice ─────────
// slice → view      the Presenter (6.9): every presentational flag pre-decided
// slice → context   the reasoner's input (6.11/G15): a BOUNDED digest
//
// They live in one file because they are the same kind of thing — pure
// projections of committed State — and they must be read side by side, so that
// "what the user sees" and "what the model sees" are never accidentally
// different derivations of the same fact.

import { bounded, MAX_CONTEXT_LINES_PER_BLOCK } from "@adr/spine/pure/context";
import type { Priority } from "./contract";
import type { TriageSlice } from "./slice";

export interface TriageRow {
  readonly ticket: string;
  readonly badge: string;
  readonly priority: Priority;
}

export interface TriageView {
  readonly rows: readonly TriageRow[];
}

export function triageView(slice: TriageSlice): TriageView {
  const rows = [...slice.tickets.values()].map((t) => {
    const priority = slice.priority.get(t.id) ?? "Normal";
    return { ticket: t.id, badge: priority.toUpperCase(), priority };
  });
  return { rows };
}

export function triageContextLines(slice: TriageSlice): readonly string[] {
  const lines = [...slice.tickets.values()].map(
    (t) => `ticket ${t.id} [${slice.priority.get(t.id) ?? "Normal"}]: ${t.body}`,
  );
  return bounded(lines, MAX_CONTEXT_LINES_PER_BLOCK);
}
