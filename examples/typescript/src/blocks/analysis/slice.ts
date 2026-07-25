// ── blocks/analysis/slice — the tiering block's own state ──────────────────
// PURE, copy-on-write, no I/O, no clock, no Actor.
//
// A note stores the WHOLE sealed `Recall` plus the `at` the fold was given. That
// pairing is deliberate: the age of a recalled conclusion is DERIVED from those
// two values (`ageOf(note.recall, note.at)`), never captured at read time — so
// it is identical on a re-fold instead of drifting with wall-clock time.

import type { Timestamp } from "../../spine/pure/ids";
import type { Recall } from "../../spine/pure/staged";

export interface AnalysisNote {
  readonly at: Timestamp;
  readonly recall: Recall;
}

export interface AnalysisSlice {
  /** what the FAST tier recalled, in order */
  readonly notes: readonly AnalysisNote[];
  /** what the DEEP tier concluded, in order */
  readonly published: readonly string[];
}

export const emptyAnalysisSlice: AnalysisSlice = { notes: [], published: [] };

export function withNote(slice: AnalysisSlice, note: AnalysisNote): AnalysisSlice {
  return { ...slice, notes: [...slice.notes, note] };
}

export function withPublished(slice: AnalysisSlice, text: string): AnalysisSlice {
  return { ...slice, published: [...slice.published, text] };
}
