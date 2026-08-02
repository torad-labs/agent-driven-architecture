// ── blocks/notes/notes.test — the block's test, CO-LOCATED with the block ──
// It names nothing outside this folder except the spine, which is what makes
// `rm -rf src/blocks/notes/` remove the feature and its proof together.

import { authority, Signature } from "@adr/spine/pure/actor";
import { describe, expect, it } from "vitest";
import { notesArm } from "./fold";
import { emptyNotesSlice } from "./slice";

const sig = new Signature("Human", authority("host:operator"));

describe("blocks/notes", () => {
  it("folds a note and emits its effect", () => {
    const out = notesArm(emptyNotesSlice, { outcome: "ok", tool: "addNote", text: "hello" }, 1, sig);
    expect(out.slice.notes).toEqual([{ text: "hello", at: 1 }]);
    expect(out.effects).toEqual([
      { kind: "NoteLogged", at: 1, effectClass: "Routine", text: "hello" },
    ]);
    expect(out.notices).toEqual([]);
  });

  it("REFUSES an empty note with a per-item notice, and folds no effect", () => {
    const out = notesArm(emptyNotesSlice, { outcome: "ok", tool: "addNote", text: "  " }, 2, sig);
    expect(out.slice).toBe(emptyNotesSlice);
    expect(out.effects).toEqual([]);
    expect(out.notices).toHaveLength(1);
  });
});
