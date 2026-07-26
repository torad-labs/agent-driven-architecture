// ── blocks/analysis/register — THE ONE PUBLIC SYMBOL (L1, I7) ──────────────
// A SECOND TIER IS OPTIONAL (11), and this file is where that stays true: the
// block plugs in exactly like the four that came before it, and an app that
// never tiers simply never registers it.
//
// `register(tier)` is 11.4's "single registry, an allowlist of the agents
// permitted to exist", declared once at the root. It is ONE entry point over a
// CLOSED set of tiers — not three exported registration functions, and not a
// boolean — so a third tier would be a compiler-named edit rather than a
// convention.

import type { BlockRegistration, Verb } from "../../spine/pure/verb";
import { isAnalysisResult } from "./contract";
import { analysisArm } from "./fold";
import { analysisContextLines, analysisView } from "./project";
import { emptyAnalysisSlice } from "./slice";
import { analysisVerbs } from "./tools";

export type AnalysisTier = "fast" | "deep" | "both";

function verbsFor<S>(tier: AnalysisTier): readonly Verb<S>[] {
  const all = analysisVerbs<S>();
  switch (tier) {
    case "fast":
      return all.filter((v) => v.name === "recallAnalysis");
    case "deep":
      return all.filter((v) => v.name === "publishAnalysis");
    case "both":
      return all;
    default: {
      const _never: never = tier;
      return _never;
    }
  }
}

export const analysis = {
  name: "analysis",
  register: <S>(tier: AnalysisTier = "both"): BlockRegistration<S> => ({
    block: "analysis",
    verbs: verbsFor<S>(tier),
  }),
  arm: analysisArm,
  view: analysisView,
  contextLines: analysisContextLines,
  owns: isAnalysisResult,
  emptySlice: emptyAnalysisSlice,
} as const;

export type {
  AnalysisCommand,
  AnalysisEffect,
  AnalysisResult,
  PublishConclusion,
} from "./contract";
export type { AnalysisRelay } from "./port";
export type { AnalysisRow, AnalysisView } from "./project";
export type { AnalysisNote, AnalysisSlice } from "./slice";
