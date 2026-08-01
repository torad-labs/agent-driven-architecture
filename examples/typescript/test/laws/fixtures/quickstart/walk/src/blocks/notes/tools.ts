// ── blocks/notes/tools — APPEND 3: the Verb entry ─────────────────────────
// Name, description, schema, a PURE `run`, and the `sign` that turns the result
// into the command the bus commits. `reversible` because a note is not an
// irreversible act; an irreversible verb would declare `requestedBy` and the
// boundary gate would demand a different principal's confirmation.

import type { Verb } from "@adr/spine/pure/verb";
import { reversible } from "@adr/spine/pure/verb";
import { object, string } from "valibot";
import type { AddNoteCommand, AddNoteResult } from "./contract";

export function notesVerbs<S>(): readonly Verb<S>[] {
  return [
    reversible<S, { text: string }, AddNoteResult, AddNoteCommand>({
      name: "addNote",
      describe: "Record a note on the session.",
      schema: object({ text: string() }),
      run: (input) => ({ outcome: "ok", tool: "addNote", text: input.text }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "addNote",
        sig,
        id,
        text: result.text,
      }),
    }),
  ];
}
