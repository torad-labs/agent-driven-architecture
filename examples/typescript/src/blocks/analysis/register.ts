// ── blocks/analysis/register — THE ONE PUBLIC SYMBOL (G11) ─────────────
// A SECOND TIER IS OPTIONAL (11), and this file is where that stays true: the
// block plugs in exactly like the four that came before it, and an app that
// never tiers simply never registers it.
//
// `register(tier)` is 11.4's "single registry, an allowlist of the agents
// permitted to exist", declared once at the root. It is ONE entry point over a
// CLOSED set of tiers — not three exported registration functions, and not a
// boolean — so a third tier would be a compiler-named edit rather than a
// convention.

import type { Handlers } from "@adr/spine/pure/effect";
import type { BlockRegistration, Verb } from "@adr/spine/pure/verb";
import type { AnalysisEffect } from "./contract";
import { isAnalysisResult } from "./contract";
import { analysisArm } from "./fold";
import type { AnalysisRelay } from "./port";
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
  /** THE EFFECT HANDLERS. Registered exactly like the verbs above and for the
   *  same reason: performing a `AnalysisEffect` case is this block's business, and a
   *  case this table does not answer is a compile error HERE, in the folder that
   *  owns it, rather than a missing branch at the composition root. The root
   *  binds the dependency and assembles; it names no kind but `Diag`.
   *
   *  The deep tier's write is an ordinary effect descriptor (14.2), so REPLAY
   *  stubs it and RECOVERY dedupes it on `EffectKey`, for free. */
  handlers: (relay: AnalysisRelay): Handlers<AnalysisEffect> => ({
    PublishConclusion: (effect) => relay.publish(effect.at, effect.text),
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
