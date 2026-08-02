// ── blocks/notes/project — the two pure projections ───────────────────────
// One for the surface, one for the reasoner. Both are pure functions of the
// slice, and the reasoner's is BOUNDED — the bound arrives, it is not looked up.

import { bounded, MAX_CONTEXT_LINES_PER_BLOCK } from "@adr/spine/pure/context";
import type { NotesSlice } from "./slice";

export interface NotesView {
  readonly count: number;
  readonly lines: readonly string[];
}

export function notesView(slice: NotesSlice): NotesView {
  return { count: slice.notes.length, lines: slice.notes.map((n) => n.text) };
}

export function notesContextLines(
  slice: NotesSlice,
  max: number = MAX_CONTEXT_LINES_PER_BLOCK,
): readonly string[] {
  return bounded(
    slice.notes.map((n) => `note @${n.at}: ${n.text}`),
    max,
  );
}
