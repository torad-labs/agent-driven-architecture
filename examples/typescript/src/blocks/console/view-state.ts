// ── blocks/console/view-state — EPHEMERAL, and the ONLY exception (4.6) ────
// Hover, scroll offset, which panel is mid-drag, unsubmitted text. This NEVER
// enters a tool, NEVER folds, NEVER signs, and is never part of State.
//
// The test is 4.6's, verbatim: if losing the field on a re-fold would change
// what the system believes or what the artifact contains, it is truth — fold
// it. Nothing here passes that test. A scroll offset is not a decision; a
// deliberate repositioning is, and that one is a Command (see `contract.ts`).
//
// This file imports NOTHING and is imported only by `project.ts` (check C12),
// so there is no path by which it could reach the fold even by accident.

export interface ConsoleViewState {
  readonly hoveredTicket: string | null;
  readonly scrollOffset: number;
  readonly draft: string;
}

export const initialViewState: ConsoleViewState = {
  hoveredTicket: null,
  scrollOffset: 0,
  draft: "",
};
