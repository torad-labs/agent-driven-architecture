// ── app/assemble — THE THREE TOTAL DISPATCHERS (I3) ────────────────────────
//   fold            results → (State, Effect[])      the only decider
//   project         State   → ViewModel              the Presenter (6.9)
//   projectContext  State   → Context                the reasoner's input (F4)
//
// Three, not one: they consume different things (results / slices / slices) and
// 6.9 forbids fusing the fold with the projections.
//
// EXHAUSTIVENESS, TWICE. `foldOne` closes over `outcome` with a `never` guard;
// `foldOk` closes over BLOCK OWNERSHIP with a `never` guard. TypeScript has no
// sealed sub-hierarchies, so the second one is a chain of type predicates
// rather than a `switch` — but the property is the same and it is enforced the
// same way: add a block's result type to `app/contract`'s union without adding
// its branch here and the build fails on `const _never: never = r`.
//
// Note what is NOT here: a per-VERB branch. Adding a verb touches four sites,
// all four inside its own block folder, and zero at the root (L5, §11.1).

import type { Signature } from "../spine/pure/actor";
import type { Context } from "../spine/pure/context";
import { MAX_CONTEXT_NOTICES, bounded } from "../spine/pure/context";
import type { Timestamp } from "../spine/pure/ids";
import type { Notice } from "../spine/pure/notice";
import { renderNotice } from "../spine/pure/notice";
import type { StagedInput } from "../spine/pure/staged";
import { spineArm, unclaimedArm, withNotices } from "../spine/pure/spine-slice";
import type { ToolResultBase } from "../spine/pure/tool-result";
import { spineView } from "../spine/pure/view";
import type { ArmOut, FoldOut } from "../spine/pure/verb";

import { analysis } from "../blocks/analysis/register";
import { artifact } from "../blocks/artifact/register";
import { consoleBlock } from "../blocks/console/register";
import { escalation } from "../blocks/escalation/register";
import { inbox } from "../blocks/inbox/register";
import { triage } from "../blocks/triage/register";

import type { AppView, Effect, OkResult, State, ToolResult } from "./contract";

export function fold(
  state: State,
  results: readonly ToolResult[],
  now: Timestamp,
  sig: Signature,
): FoldOut<State> {
  let current = state;
  const effects: Effect[] = [];
  for (const r of results) {
    const out = foldOne(current, r, now, sig);
    current = out.state;
    effects.push(...(out.effects as readonly Effect[]));
  }
  return { state: current, effects };
}

function foldOne(state: State, r: ToolResult, now: Timestamp, sig: Signature): FoldOut<State> {
  switch (r.outcome) {
    // The spine's own two arms, identical in every application (§7): a
    // diagnostic and a per-item notice; no transition, no domain effect.
    case "unhandled":
    case "refused": {
      const out = spineArm(state.spine, r, now);
      return { state: { ...state, spine: withNotices(out.slice, out.notices) }, effects: out.effects };
    }
    case "ok":
      return foldOk(state, r, now, sig);
    default: {
      const _never: never = r;
      return _never;
    }
  }
}

function foldOk(state: State, r: OkResult, now: Timestamp, sig: Signature): FoldOut<State> {
  if (triage.owns(r)) {
    return merge(triage.arm(state.triage, r, now, sig), (slice) => ({ ...state, triage: slice }));
  }
  if (escalation.owns(r)) {
    return merge(escalation.arm(state.escalation, r, now, sig), (slice) => ({ ...state, escalation: slice }));
  }
  if (consoleBlock.owns(r)) {
    return merge(consoleBlock.arm(state.console, r, now, sig), (slice) => ({ ...state, console: slice }));
  }
  if (artifact.owns(r)) {
    return merge(artifact.arm(state.artifact, r, now, sig), (slice) => ({ ...state, artifact: slice }));
  }
  if (analysis.owns(r)) {
    return merge(analysis.arm(state.analysis, r, now, sig), (slice) => ({ ...state, analysis: slice }));
  }
  if (inbox.owns(r)) {
    return merge(inbox.arm(state.inbox, r, now, sig), (slice) => ({ ...state, inbox: slice }));
  }
  // Every "ok" result belongs to exactly one block. Add a block to the union in
  // app/contract without adding its branch above, and this line fails to
  // compile — which is the edit list L5 promises, produced by the compiler.
  const _never: never = r;
  void _never;

  // COMPILE-TIME EXHAUSTIVENESS IS NOT RUNTIME TOTALITY. The chain above is
  // type predicates, and TypeScript TRUSTS a predicate it cannot verify — so a
  // block whose `owns` went stale narrows `r` to `never` here while a real
  // value flows through. Returning `_never` returned `undefined`, and the
  // caller died on `out.effects is not iterable`: a crash, from the one arm
  // 6.5 says must never crash.
  //
  // So the arm obeys 6.5 like every other: total AND observable. It folds an
  // explicit Unhandled marker and emits a diagnostic, exactly as an unknown
  // tool name does — never a silent drop, and never a thrown fold.
  // The fold does not mint a ToolResult to get here — C7 forbids that, and it is
  // right to: transport comes from a verb body or the boundary, never the fold.
  // It asks the spine for the arm instead.
  const out = unclaimedArm(state.spine, (r as ToolResultBase).tool, now);
  return { state: { ...state, spine: withNotices(out.slice, out.notices) }, effects: out.effects };
}

/** A block's arm returns its own slice plus per-item notices; the notices land
 *  in the SPINE's slice, so a block never has to know that notices exist as a
 *  cross-cutting concern — and never has a way to touch RunStatus (F9). */
function merge<S>(out: ArmOut<S>, put: (slice: S) => State): FoldOut<State> {
  const next = put(out.slice);
  return {
    state: { ...next, spine: withNotices(next.spine, out.notices as readonly Notice[]) },
    effects: out.effects,
  };
}

export function project(state: State): AppView {
  return {
    ...spineView(state.spine),
    triage: triage.view(state.triage),
    escalation: escalation.view(state.escalation),
    console: consoleBlock.view(state.console),
    artifact: artifact.view(state.artifact),
    analysis: analysis.view(state.analysis),
    inbox: inbox.view(state.inbox),
  };
}

export function projectContext(state: State, staged: readonly StagedInput[]): Context {
  return {
    staged,
    lines: [
      ...triage.contextLines(state.triage),
      ...escalation.contextLines(state.escalation),
      ...consoleBlock.contextLines(state.console),
      ...artifact.contextLines(state.artifact),
      ...analysis.contextLines(state.analysis),
      ...inbox.contextLines(state.inbox),
    ],
    notices: bounded(state.spine.notices.map(renderNotice), MAX_CONTEXT_NOTICES),
    // the artifact by COUNT, never its lines — this is the growth bound
    artifactLineCount: state.artifact.lines.length,
  };
}

/** The Dispatchers bundle the impure seam and the replay harness are given.
 *  Declared with METHOD syntax so the app's CLOSED unions satisfy the spine's
 *  open base signature: the spine hands the fold only results its own registry
 *  produced, plus the spine's own two cases. */
export const dispatchers = {
  fold(state: State, results: readonly ToolResult[], now: Timestamp, sig: Signature): FoldOut<State> {
    return fold(state, results, now, sig);
  },
  projectContext,
};
