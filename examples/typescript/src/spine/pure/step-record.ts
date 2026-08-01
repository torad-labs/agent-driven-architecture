// ── spine/pure/step-record — THE unit of commit and THE unit of replay (G9) ─
// The shipped reference committed a PAIR — append(signedCommands, results) —
// with no clock on it. Measured consequence: a live boundary folded at
// now = 1001 and its re-fold produced at = 0. Every timestamp was lost, and in
// any domain where `now` lands in State, the state was lost outright.
//
// So the commit is the STEP, not the pair. Every field earns its place:
//   schemaVersion  which shape the rest of the record is in (14.7) — the
//             envelope, so a log written across deployments is self-describing
//   now       without it a re-fold cannot reproduce what a live boundary wrote
//   sig       the stamp the fold was given
//   staged    the ordered off-bus input fixture this step consumed (5.4)
//   actions   what was ASKED — the audit half G1 named
//   results   POST-GATE — exactly what was FOLDED (so a refusal re-folds
//             without calling the authorization seam again: G9)
//   commands  the signed record, with ids that cannot be re-derived
//   context   promptVersion + the rendered digest the model saw (G15)
//
// THE SCHEMA ENVELOPE (14.7). `schemaVersion` is REQUIRED and typed as the
// LITERAL current version, so the compiler is the enforcement layer twice over:
// the boundary cannot commit a record without stamping one, and a HISTORICAL
// record — `StepRecordV1` below — is not a `StepRecord` at all and cannot be
// handed to `refold`. Upcasting is the only way in, which is exactly what 14.7
// asks for: never touch history (14.1); transform an old record into the
// current shape on the way into the fold.
//
// BOTH HALVES OF THE OLD RECORD ARE REFUSED, and the second half is the one a
// structural language makes easy to get wrong. The ENVELOPE half is this file's
// literal type. The PAYLOAD half belongs to the block: a historical payload has
// to CONFLICT with `ToolResultBase` on a member, or TypeScript's structural
// assignability would let it be spread by hand into a current-shape record and
// re-folded — a v2 envelope over v1 payloads, which is precisely the state the
// envelope exists to make unrepresentable. The triage block spells that
// conflict as `outcome: "ok-v1"`; see its contract for why a marker property
// would not have worked.

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

/** The shape this port WRITES today.
 *
 *  It is deliberately NOT the reducer version a snapshot is tagged with
 *  (`reducerVersion`, declared at `app/wire`), and NOT the spine version marker
 *  that says which template copy this tier is (`SPINE_VERSION`, declared at
 *  `spine/pure/version`). Three independent questions, three independent
 *  numbers, and the ratified record refuses to merge any two of them. */
export const SCHEMA_VERSION = 2;

/** GENESIS is 1, and there is no v0: the reference persists no log, so the
 *  first shape it ever wrote is the first shape anything can read. v1 survives
 *  as a type and a fixture so the upcast path is exercised rather than
 *  described — and it is STAMPED, because a version an old record does not
 *  carry is a version nothing could ever have dispatched on. */
export const GENESIS_SCHEMA_VERSION = 1;

export interface StepRecord {
  /** The envelope (14.7). Typed as the literal, so a record in any other shape
   *  — including a correctly-shaped record still stamped GENESIS — is not a
   *  `StepRecord`, and the compiler rather than a runtime branch refuses it at
   *  the door of the fold. */
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly now: Timestamp;
  readonly sig: Signature;
  readonly staged: readonly StagedInput[];
  readonly actions: readonly Action[];
  readonly results: readonly ToolResultBase[];
  readonly commands: readonly CommandBase[];
  readonly context: ContextFixture;
}

/** THE v1 ENVELOPE — what this port wrote while the version was 1.
 *
 *  Generic in its payload, and that is G11 rather than taste: the payload
 *  shapes a v1 log holds are a BLOCK's, and the spine may not name a block
 *  (check C15). So the spine declares the envelope and the app supplies what
 *  its old payloads were. `commands` is NOT generic, because Commands do not
 *  evolve here — a Command is the signed record of what a principal
 *  authorized, and 14.1 forbids rewriting it. (In this port a block's contract
 *  may not even NAME a Signature — check C4 — so a historical Command shape
 *  has nowhere it could be declared.)
 *
 *  It is a separate interface rather than a `Partial<StepRecord>`: the point of
 *  the envelope is that the two are DIFFERENT TYPES, one of which is refused. */
export interface StepRecordV1<R> {
  readonly schemaVersion: typeof GENESIS_SCHEMA_VERSION;
  readonly now: Timestamp;
  readonly sig: Signature;
  readonly staged: readonly StagedInput[];
  readonly actions: readonly Action[];
  readonly results: readonly R[];
  readonly commands: readonly CommandBase[];
  readonly context: ContextFixture;
}

/** UPCAST ON READ (14.7): re-stamp the envelope, and lift every payload with
 *  the app's own upcaster. History is not touched — a NEW value is produced on
 *  the way into the fold, which is the whole difference between upcasting and
 *  the rewrite 14.1 forbids. */
export function upcastV1<R>(
  record: StepRecordV1<R>,
  payload: (result: R) => ToolResultBase,
): StepRecord {
  return {
    ...record,
    schemaVersion: SCHEMA_VERSION,
    results: record.results.map(payload),
  };
}
