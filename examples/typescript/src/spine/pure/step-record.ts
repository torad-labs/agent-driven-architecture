// ── spine/pure/step-record — THE unit of commit and THE unit of replay (F8) ─
// The shipped reference committed a PAIR — append(signedCommands, results) —
// with no clock on it. Measured consequence: a live boundary folded at
// now = 1001 and its re-fold produced at = 0. Every timestamp was lost, and in
// any domain where `now` lands in State, the state was lost outright.
//
// So the commit is the STEP, not the pair. All seven fields earn their place:
//   now       without it a re-fold cannot reproduce what a live boundary wrote
//   sig       the stamp the fold was given
//   staged    the ordered off-bus input fixture this step consumed (5.4)
//   actions   what was ASKED — the audit half F1 named
//   results   POST-GATE — exactly what was FOLDED (so a refusal re-folds
//             without calling the authorization seam again: G9)
//   commands  the signed record, with ids that cannot be re-derived
//   context   promptVersion + the rendered digest the model saw (F4)
//
// SCHEMA ENVELOPE (14.7) IS OUT OF SCOPE for this port: there is no
// `schemaVersion` and no upcaster. That is deliberate, not an omission.

import type { Signature } from "./actor";
import type { CommandBase } from "./command";
import type { ContextFixture } from "./context";
import type { RawInput, Timestamp, ToolName } from "./ids";
import type { StagedInput } from "./staged";
import type { ToolResultBase } from "./tool-result";

/** An OPEN boundary input (the 6.10 carve-out): a name and an undecoded blob.
 *  Declared here because it is a field of the committed record; re-exported
 *  from `spine/boundary/action`, where it is resolved. */
export interface Action {
  readonly tool: ToolName;
  readonly input: RawInput;
}

export interface StepRecord {
  readonly now: Timestamp;
  readonly sig: Signature;
  readonly staged: readonly StagedInput[];
  readonly actions: readonly Action[];
  readonly results: readonly ToolResultBase[];
  readonly commands: readonly CommandBase[];
  readonly context: ContextFixture;
}
