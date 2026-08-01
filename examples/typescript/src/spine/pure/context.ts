// ── spine/pure/context — the THIRD pure projection (G15) ────────────────────
// The reasoner's own input seam, promoted to a named type beside State→ViewModel.
//
//   projectContext(state, staged) -> Context     PURE. A projection of committed
//                                                State plus the ORDERED off-bus
//                                                input this step consumed (5.4).
//                                                Never a mutable accumulator,
//                                                never appended to.
//   render(context) -> Text                      PURE. The exact text the model saw.
//
// SCOPE, STATED SO THE SILENCE READS AS A BOUNDARY (6.11). The contxt SEAM is in
// scope: this projection is pure, its growth bound is stated below, and the text
// it renders rides the committed record as a fixture. Context ENGINEERING —
// WHAT you choose to project, how you rank, retrieve or compact it, and how you
// author the prompt — is PRODUCT-OWNED, beside authorization, persistence and
// configuration. The architecture's whole obligation is the invariant, not the
// strategy: whatever you project is a pure function of committed State plus
// staged input, and IF YOU COMPACT, THE SUMMARY IS A CAPTURED FIXTURE — because
// "why did the agent decide this?" is unanswerable without the text the model
// actually read.
//
// GROWTH BOUND (stated, not implied): |Context| is O(1) in timeline length.
// Each block contributes at most `bounds.linesPerBlock` digest lines, the spine
// contributes at most `bounds.notices` recent notices, and the artifact
// contributes a COUNT — never its content. So the reasoner's input does not
// grow with session length. The two numbers are ROOT-CONFIGURABLE and default
// to the constants below (docs/DECISIONS.md:174): what is fixed is that a bound
// is declared, not which number it holds.
//
// The rendered digest plus the active prompt version are captured on the
// timeline as an ordered fixture (`ContextFixture` on every StepRecord), which
// turns the fixture into a CHECK: replay re-derives the digest from committed
// State and compares. A change to projectContext that silently alters what the
// model saw fails the golden trace — without ever re-running the model, and a
// timeline re-derived under DIFFERENT bounds diverges at the same seam.

import type { StagedInput } from "./staged";
import { renderStaged } from "./staged";

export interface Context {
  /** ORDERED, and the order is law rather than style: `[Perceived?, Recalled?]`
   *  — perception first, recall second. It changes the rendered digest, and the
   *  digest is what the committed `ContextFixture` pins. */
  readonly staged: readonly StagedInput[];
  readonly lines: readonly string[];
  readonly notices: readonly string[];
  readonly artifactLineCount: number;
}

/** each block's contextLines() returns at most this many — the SHIPPED DEFAULT */
export const MAX_CONTEXT_LINES_PER_BLOCK = 8;
/** the most recent notices only — the SHIPPED DEFAULT */
export const MAX_CONTEXT_NOTICES = 8;

// ── The bound as a VALUE, not only as a constant (docs/DECISIONS.md:174) ────
// The two numbers above are the DEFAULT, not the law. The law is that a bound
// EXISTS, is declared, and rides one value the root sets once — the same move
// the mailbox deadlines already made (spine/pure/mailbox), for the same reason:
// a deployment whose reasoner has a smaller window must be able to say so
// without forking the spine, and a bound nobody can state is a bound nobody
// reviews.
//
// WHAT THE INJECTION BUYS THAT THE CONSTANT COULD NOT. A constant is both the
// stamping side and the re-deriving side of the committed digest, so moving it
// moves both halves in one run and the golden trace stays green — the check
// re-derives with the same number it committed under and cancels itself. Once
// the bound is a VALUE the boundary was handed, replay can be re-derived under
// a DIFFERENT one, and the digest divergence it produces is the instrument that
// makes the fixture a real check of the bound rather than of the projection
// only. That cross-bound walk is the test layer for this file.

/** The reasoner's growth bound, as one value the composition root owns. */
export interface ContextBounds {
  /** each block's contextLines() returns at most this many */
  readonly linesPerBlock: number;
  /** the most recent notices only */
  readonly notices: number;
}

/** What the root gets if it says nothing: the two constants above, unchanged.
 *  Pinned to its literals by test/spine/context.test.ts, so editing a default
 *  here is a red diff rather than a silent change to what every model saw. */
export const DEFAULT_CONTEXT_BOUNDS: ContextBounds = {
  linesPerBlock: MAX_CONTEXT_LINES_PER_BLOCK,
  notices: MAX_CONTEXT_NOTICES,
};

/** Keep the most recent `max` entries. The bound is applied at the source, so a
 *  block cannot contribute an unbounded slice of its own history. */
export function bounded(lines: readonly string[], max: number): readonly string[] {
  return lines.length <= max ? lines : lines.slice(lines.length - max);
}

export function render(context: Context): string {
  const staged = context.staged.length === 0 ? ["staged: none"] : context.staged.map(renderStaged);
  return [
    ...staged,
    ...context.lines,
    ...context.notices,
    `artifact: ${context.artifactLineCount} line(s)`,
  ].join("\n");
}

/** What rides the committed record: the injected prompt asset's version (7.3,
 *  14.7) and the rendered digest. Neither is derivable from the bus alone. */
export interface ContextFixture {
  readonly promptVersion: string;
  readonly digest: string;
}
