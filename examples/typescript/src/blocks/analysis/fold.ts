// ── blocks/analysis/fold — the block's ARM (12.4) ──────────────────────────
// The asymmetry between the two arms IS the untrusted-recall rule, written as
// code rather than as a warning:
//
//   recallAnalysis   appends a note. EMITS NO EFFECT AT ALL. Recalled content
//                    cannot reach the relay, let alone anything irreversible.
//   publishAnalysis  appends the conclusion AND emits `PublishConclusion` — the
//                    deep tier's own signed act, from its own success branch.

import type { Signature } from "../../spine/pure/actor";
import type { Timestamp } from "../../spine/pure/ids";
import type { ArmOut } from "../../spine/pure/verb";
import { armOut } from "../../spine/pure/verb";
import type { AnalysisResult, PublishConclusion } from "./contract";
import type { AnalysisSlice } from "./slice";
import { withNote, withPublished } from "./slice";

export function analysisArm(
  slice: AnalysisSlice,
  r: AnalysisResult,
  now: Timestamp,
  _sig: Signature,
): ArmOut<AnalysisSlice> {
  switch (r.tool) {
    case "recallAnalysis":
      // `now` is the ONE clock read the boundary made; pairing it with the
      // recall's own `publishedAt` is what makes the age replayable.
      return armOut(withNote(slice, { at: now, recall: r.recall }), [], []);
    case "publishAnalysis": {
      const effect: PublishConclusion = { kind: "PublishConclusion", at: now, text: r.text };
      return armOut(withPublished(slice, r.text), [effect], []);
    }
    default: {
      const _never: never = r;
      return _never;
    }
  }
}
