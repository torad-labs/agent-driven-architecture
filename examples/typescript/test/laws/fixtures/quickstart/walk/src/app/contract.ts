// ── app/contract — THE ROOT: the only place that names every block ─────────
// State is a PRODUCT of slices; the three transport sets are closed unions.
// A second block is three more union memberships and one more slice field.

import type {
  NotesCommand,
  NotesEffect,
  NotesResult,
  NotesSlice,
  NotesView,
} from "@adr/block-notes/register";
import { notes } from "@adr/block-notes/register";
import type { SpineCommand } from "@adr/spine/pure/command";
import type { SpineEffect } from "@adr/spine/pure/effect";
import type { SpineSlice } from "@adr/spine/pure/spine-slice";
import { emptySpineSlice } from "@adr/spine/pure/spine-slice";
import type { SpineResult } from "@adr/spine/pure/tool-result";
import type { ViewModel } from "@adr/spine/pure/view";

export type ToolResult = SpineResult | NotesResult;
export type Command = SpineCommand | NotesCommand;
export type Effect = SpineEffect | NotesEffect;

export type OkResult = Extract<ToolResult, { readonly outcome: "ok" }>;

export interface State {
  readonly spine: SpineSlice;
  readonly notes: NotesSlice;
}

export interface AppView extends ViewModel {
  readonly notes: NotesView;
}

export function initialState(): State {
  return { spine: emptySpineSlice, notes: notes.emptySlice };
}
