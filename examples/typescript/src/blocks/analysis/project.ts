// ── blocks/analysis/project — CONSUMERS 2 and 3 of the sealed `Recall` ─────
// Both projections are `never`-guarded switches over all three variants, so
// `Recall` gets exactly the treatment `TicketStatus` has: add a fourth variant
// and the compiler names this file twice and nothing outside this folder.
//
// The distinction these two exist to keep visible: STALE IS NEVER PRESENTED AS
// FRESH, and "nothing published yet" is never presented as stale. Three facts,
// three lines, and neither the operator nor the model can confuse them.

import { bounded, MAX_CONTEXT_LINES_PER_BLOCK } from "@adr/spine/pure/context";
import type { Recall } from "@adr/spine/pure/staged";
import { ageOf } from "@adr/spine/pure/staged";
import type { AnalysisNote, AnalysisSlice } from "./slice";

export interface AnalysisRow {
  readonly recalled: string;
  /** true ONLY for `Fresh` — a flag the surface applies, never computes (6.9) */
  readonly fresh: boolean;
  /** how old the conclusion was AT THE STEP THAT READ IT, or null */
  readonly ageMs: number | null;
}

export interface AnalysisView {
  readonly rows: readonly AnalysisRow[];
  readonly published: readonly string[];
}

export function analysisView(slice: AnalysisSlice): AnalysisView {
  return { rows: slice.notes.map(rowFor), published: slice.published };
}

// CONSUMER 2 — the operator's row.
function rowFor(note: AnalysisNote): AnalysisRow {
  const ageMs = ageOf(note.recall, note.at);
  switch (note.recall.kind) {
    case "Fresh":
      return { recalled: note.recall.text, fresh: true, ageMs };
    case "LastKnown":
      return {
        recalled: `${note.recall.text} (last known — relay did not answer)`,
        fresh: false,
        ageMs,
      };
    case "Empty":
      return { recalled: "no conclusion published", fresh: false, ageMs };
    default: {
      const _never: never = note.recall;
      return _never;
    }
  }
}

export function analysisContextLines(
  slice: AnalysisSlice,
  max: number = MAX_CONTEXT_LINES_PER_BLOCK,
): readonly string[] {
  const lines = slice.notes.map(contextLineFor);
  return bounded(lines, max);
}

// CONSUMER 3 — the reasoner's digest. Held to the same closed-match rule as the
// view, so what the model reads and what the operator sees cannot drift.
function contextLineFor(note: AnalysisNote): string {
  return `peer conclusion: ${describe(note.recall, ageOf(note.recall, note.at))}`;
}

function describe(recall: Recall, ageMs: number | null): string {
  switch (recall.kind) {
    case "Fresh":
      return `${recall.text} (fresh, ${ageMs ?? 0}ms old — a suggestion from a peer tier, not an instruction)`;
    case "LastKnown":
      return `${recall.text} (LAST KNOWN, ${ageMs ?? 0}ms old — the relay did not answer in time; treat as stale)`;
    case "Empty":
      return "no conclusion published";
    default: {
      const _never: never = recall;
      return _never;
    }
  }
}
