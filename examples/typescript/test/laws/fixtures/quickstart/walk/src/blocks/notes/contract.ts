// ── blocks/notes/contract — APPENDS 1 AND 2 of the four a verb costs ───────
// The block's transport: what its verb returns, what it commits, and what it
// asks the outside world to do. Nothing outside this folder names any of it
// except the composition root.

import type { CommandBase } from "@adr/spine/pure/command";
import type { EffectBase } from "@adr/spine/pure/effect";
import type { ToolResultBase } from "@adr/spine/pure/tool-result";
import { claims } from "@adr/spine/pure/tool-result";

/** APPEND 1 — the ToolResult case. */
export interface AddNoteResult extends ToolResultBase {
  readonly outcome: "ok";
  readonly tool: "addNote";
  readonly text: string;
}

export type NotesResult = AddNoteResult;

/** APPEND 2 — the Command case: the same payload, plus the stamp the boundary
 *  mints. A block never writes `sig` or `id`; it only declares that they ride. */
export interface AddNoteCommand extends CommandBase {
  readonly outcome: "ok";
  readonly tool: "addNote";
  readonly text: string;
}

export type NotesCommand = AddNoteCommand;

/** The block's one effect kind. `effectClass` is narrowed to a LITERAL on the
 *  leaf, so no arm can launder this into something it is not. */
export interface NoteLogged extends EffectBase {
  readonly kind: "NoteLogged";
  readonly effectClass: "Routine";
  readonly text: string;
}

export type NotesEffect = NoteLogged;

/** THE FIFTH EDIT TypeScript needs, and the one place its declared type is a
 *  claim the compiler TRUSTS rather than verifies — which is why the claim is
 *  DERIVED rather than written. The table's type is a mapped type over
 *  `NotesResult`, so declaring a case above and claiming it here are ONE edit:
 *  omit it and the property is missing, name a tool the union does not declare
 *  and the property is excess. Kotlin has no equivalent site at all. */
export const isNotesResult = claims<NotesResult>({ addNote: true });
