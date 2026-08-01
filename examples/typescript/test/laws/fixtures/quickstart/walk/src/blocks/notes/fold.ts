// ── blocks/notes/fold — APPEND 4: the fold arm ────────────────────────────
// Reads current state, decides, emits its effects INSIDE the success branch,
// and folds a per-item Notice when it refuses. It never touches RunStatus.

import type { Signature } from "@adr/spine/pure/actor";
import type { Timestamp } from "@adr/spine/pure/ids";
import { rejected } from "@adr/spine/pure/notice";
import type { ArmOut } from "@adr/spine/pure/verb";
import { armOut } from "@adr/spine/pure/verb";
import type { NoteLogged, NotesResult } from "./contract";
import type { NotesSlice } from "./slice";
import { withNote } from "./slice";

export function notesArm(
  slice: NotesSlice,
  r: NotesResult,
  now: Timestamp,
  _sig: Signature,
): ArmOut<NotesSlice> {
  switch (r.tool) {
    case "addNote": {
      if (r.text.trim() === "") {
        return armOut(slice, [], [rejected(now, r.tool, "an empty note is not a note")]);
      }
      const logged: NoteLogged = {
        kind: "NoteLogged",
        at: now,
        effectClass: "Routine",
        text: r.text,
      };
      return armOut(withNote(slice, r.text, now), [logged], []);
    }
    default: {
      const _never: never = r.tool;
      return _never;
    }
  }
}
