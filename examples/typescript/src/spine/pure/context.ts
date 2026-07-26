// ── spine/pure/context — the THIRD pure projection (F4, G15) ────────────────
// The reasoner's own input seam, promoted to a named type beside State→ViewModel.
//
//   projectContext(state, staged) -> Context     PURE. A projection of committed
//                                                State plus the ORDERED off-bus
//                                                input this step consumed (5.4).
//                                                Never a mutable accumulator,
//                                                never appended to.
//   render(context) -> Text                      PURE. The exact text the model saw.
//
// SCOPE, STATED SO THE SILENCE READS AS A BOUNDARY (A3). The context SEAM is in
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
// Each block contributes at most MAX_CONTEXT_LINES_PER_BLOCK digest lines, the
// spine contributes at most MAX_CONTEXT_NOTICES recent notices, and the
// artifact contributes a COUNT — never its content. So the reasoner's input
// does not grow with session length.
//
// The rendered digest plus the active prompt version are captured on the
// timeline as an ordered fixture (`ContextFixture` on every StepRecord), which
// turns the fixture into a CHECK: replay re-derives the digest from committed
// State and compares. A change to projectContext that silently alters what the
// model saw fails the golden trace — without ever re-running the model.

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

/** each block's contextLines() returns at most this many */
export const MAX_CONTEXT_LINES_PER_BLOCK = 8;
/** the most recent notices only */
export const MAX_CONTEXT_NOTICES = 8;

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
