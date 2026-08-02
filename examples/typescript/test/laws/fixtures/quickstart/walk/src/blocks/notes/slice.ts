// ── blocks/notes/slice — the block's own slice of State ───────────────────
// Truth, not decoration: losing a note on a re-fold would change what the
// system believes, so it folds.

import type { Timestamp } from "@adr/spine/pure/ids";

export interface Note {
  readonly text: string;
  readonly at: Timestamp;
}

export interface NotesSlice {
  readonly notes: readonly Note[];
}

export const emptyNotesSlice: NotesSlice = { notes: [] };

export function withNote(slice: NotesSlice, text: string, at: Timestamp): NotesSlice {
  return { notes: [...slice.notes, { text, at }] };
}
