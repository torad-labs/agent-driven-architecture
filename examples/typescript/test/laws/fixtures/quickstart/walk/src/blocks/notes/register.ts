// ── blocks/notes/register — THE ONE PUBLIC SYMBOL ─────────────────────────
// The whole folder reaches the composition root through this file and nothing
// else. Delete the folder and remove its lines at the root, and the feature is
// gone; nothing else in the tree ever named it.

import type { Handlers } from "@adr/spine/pure/effect";
import type { BlockRegistration } from "@adr/spine/pure/verb";
import { isNotesResult, type NotesEffect } from "./contract";
import { notesArm } from "./fold";
import { notesContextLines, notesView } from "./project";
import { emptyNotesSlice } from "./slice";
import { notesVerbs } from "./tools";

export const notes = {
  name: "notes",
  register: <S>(): BlockRegistration<S> => ({ block: "notes", verbs: notesVerbs<S>() }),
  arm: notesArm,
  view: notesView,
  contextLines: notesContextLines,
  owns: isNotesResult,
  emptySlice: emptyNotesSlice,
  /** The block PERFORMS its own effect kinds. A new kind is a case above plus a
   *  line here — both inside this folder, and the compiler names the second. */
  handlers: (log: (line: string) => void): Handlers<NotesEffect> => ({
    NoteLogged: (effect) => log(`[note @${effect.at}] ${effect.text}`),
  }),
} as const;

export type { NotesCommand, NotesEffect, NotesResult } from "./contract";
export type { NotesView } from "./project";
export type { NotesSlice } from "./slice";
