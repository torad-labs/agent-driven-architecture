// ── app/assemble — THE THREE TOTAL DISPATCHERS ────────────────────────────
//   fold            results → (State, Attributed[])
//   project         State   → ViewModel
//   projectContext  State   → Context
// Exhaustiveness twice: over `outcome`, and over block ownership. Add a block
// to the unions in app/contract without a branch here and this file stops
// compiling — that is the edit list, produced by the compiler.

import { notes } from "@adr/block-notes/register";
import type { Signature } from "@adr/spine/pure/actor";
import type { Context, ContextBounds } from "@adr/spine/pure/context";
import { bounded, DEFAULT_CONTEXT_BOUNDS } from "@adr/spine/pure/context";
import type { Attributed, EffectBase } from "@adr/spine/pure/effect";
import { attributed } from "@adr/spine/pure/effect";
import type { Timestamp } from "@adr/spine/pure/ids";
import type { Notice } from "@adr/spine/pure/notice";
import { renderNotice } from "@adr/spine/pure/notice";
import { spineArm, unclaimedArm, withNotices } from "@adr/spine/pure/spine-slice";
import type { StagedInput } from "@adr/spine/pure/staged";
import type { Sealed, ToolResultBase } from "@adr/spine/pure/tool-result";
import type { ArmOut, FoldOut } from "@adr/spine/pure/verb";
import { spineView } from "@adr/spine/pure/view";
import type { AppView, OkResult, State, ToolResult } from "./contract";

interface Emitted {
  readonly state: State;
  readonly effects: readonly EffectBase[];
}

export function fold(
  state: State,
  results: readonly Sealed<ToolResult>[],
  now: Timestamp,
  sig: Signature,
): FoldOut<State> {
  let current = state;
  const effects: Attributed[] = [];
  for (const r of results) {
    const out = foldOne(current, r, now, sig);
    current = out.state;
    for (const e of out.effects) effects.push(attributed(r, e));
  }
  return { state: current, effects };
}

function foldOne(state: State, r: Sealed<ToolResult>, now: Timestamp, sig: Signature): Emitted {
  switch (r.outcome) {
    case "unhandled":
    case "refused": {
      const out = spineArm(state.spine, r, now);
      return {
        state: { ...state, spine: withNotices(out.slice, out.notices) },
        effects: out.effects,
      };
    }
    case "ok":
      return foldOk(state, r, now, sig);
    default: {
      const _never: never = r;
      return _never;
    }
  }
}

function foldOk(state: State, r: Sealed<OkResult>, now: Timestamp, sig: Signature): Emitted {
  if (notes.owns(r)) {
    return merge(notes.arm(state.notes, r, now, sig), (slice) => ({ ...state, notes: slice }));
  }
  const _never: never = r;
  void _never;
  const out = unclaimedArm(state.spine, (r as ToolResultBase).tool, now);
  return { state: { ...state, spine: withNotices(out.slice, out.notices) }, effects: out.effects };
}

function merge<S>(out: ArmOut<S>, put: (slice: S) => State): Emitted {
  const next = put(out.slice);
  return {
    state: { ...next, spine: withNotices(next.spine, out.notices as readonly Notice[]) },
    effects: out.effects,
  };
}

export function project(state: State): AppView {
  return { ...spineView(state.spine), notes: notes.view(state.notes) };
}

export function projectContext(
  state: State,
  staged: readonly StagedInput[],
  bounds: ContextBounds = DEFAULT_CONTEXT_BOUNDS,
): Context {
  return {
    staged,
    lines: [...notes.contextLines(state.notes, bounds.linesPerBlock)],
    notices: bounded(state.spine.notices.map(renderNotice), bounds.notices),
    artifactLineCount: 0,
  };
}

export const dispatchers = {
  fold(
    state: State,
    results: readonly Sealed<ToolResult>[],
    now: Timestamp,
    sig: Signature,
  ): FoldOut<State> {
    return fold(state, results, now, sig);
  },
  projectContext,
};
