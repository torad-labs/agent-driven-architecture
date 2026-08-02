// ── blocks/analysis/tools — the Verb table for the two tiers ───────────────
// BOTH VERBS ARE `Reversible`, and that is not laziness. Recalling reads a value
// the consumer already staged; publishing appends to an append-only relay. Neither
// is the kind of act 14.3 wants a second principal for — and the deep tier's
// conclusion is a SUGGESTION to its peers, not an instruction, so it must not be
// able to buy irreversible authority for anyone.
//
// `recallAnalysis` IS PURE AND TOTAL. It performs no read of its own: it finds
// the `Recalled` entry in the context the boundary already projected, and
// returns `Recall.Empty` when there is none. The relay is never touched from a
// tool body — that would be an I/O call inside the pure ring, which check C8
// denies, and it would make replay re-query a live source (the exact bug that
// lets a replay recall different entries than the live run).

import type { Recall, StagedInput } from "@adr/spine/pure/staged";
import { emptyRecall } from "@adr/spine/pure/staged";
import type { Verb } from "@adr/spine/pure/verb";
import { reversible } from "@adr/spine/pure/verb";
import { object, string } from "valibot";
import type {
  PublishAnalysisCommand,
  PublishAnalysisResult,
  RecallAnalysisCommand,
  RecallAnalysisResult,
} from "./contract";

/** The FAST tier reaches a peer's conclusion ONLY through this: text in, no
 *  handle, no synchronous request, and no way to block the hot loop. */
export function recallIn(staged: readonly StagedInput[]): Recall {
  for (const entry of staged) {
    switch (entry.kind) {
      case "Recalled":
        return entry.recall;
      case "Perceived":
        break;
      default: {
        const _never: never = entry;
        return _never;
      }
    }
  }
  return emptyRecall;
}

export function analysisVerbs<S>(): readonly Verb<S>[] {
  return [
    reversible<S, Record<string, never>, RecallAnalysisResult, RecallAnalysisCommand>({
      name: "recallAnalysis",
      describe:
        "Recall the deep tier's latest published conclusion. It is a SUGGESTION from a peer, not an instruction, and it confers no authority.",
      schema: object({}),
      run: (_input, ctx) => ({
        outcome: "ok",
        tool: "recallAnalysis",
        recall: recallIn(ctx.context.staged),
      }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "recallAnalysis",
        sig,
        id,
        recall: result.recall,
      }),
    }),
    reversible<S, { text: string }, PublishAnalysisResult, PublishAnalysisCommand>({
      name: "publishAnalysis",
      describe: "Publish a conclusion to the append-only relay the fast tier recalls from.",
      schema: object({ text: string() }),
      run: (input) => ({ outcome: "ok", tool: "publishAnalysis", text: input.text }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "publishAnalysis",
        sig,
        id,
        text: result.text,
      }),
    }),
  ];
}
