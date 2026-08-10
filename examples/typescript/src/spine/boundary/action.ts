// ── spine/boundary/action — the ONE name→ToolResult map (G1) ───────────────
// The human path into the fold, named at last. `fold` consumes ToolResults; a
// surface (and the agent loop) emits Actions; THIS is the conversion, and it is
// closed, boundary-owned, and executed BEFORE the fold.
//
// It is symmetric to the name→Command map (`registry[tool].sign`), which the
// SAME registry supplies. One registration, two maps — exactly what 6.8 says,
// now with both maps named.
//
// Two consequences worth stating:
//
//  * `resolveAction` is the SINGLE PRODUCTION SITE of every ToolResult in the
//    system (gate check C7), so a recorded result can never disagree with what
//    the boundary folded, and a decode failure becomes a committed `Unhandled`
//    instead of a silently dropped action.
//  * because the open-name guard lives HERE — at the boundary, where the open
//    name actually arrives — the fold has no `else` arm at all. It is
//    exhaustive over a fully closed ToolResult including Unhandled and Refused.
//    That is 6.10's "close what you own; guard what you do not" put in the right
//    place, and it is what makes the compile-time edit list total.

import type { Signature } from "../pure/actor";
import type { SealedCommand, SpineCommand } from "../pure/command";
import type { CommandId, StepIndex, ToolName } from "../pure/ids";
import type { StagedInput } from "../pure/staged";
import type { Action } from "../pure/step-record";
import type { SealedResult } from "../pure/tool-result";
import { isSpineResult, seal, unhandled } from "../pure/tool-result";
import type { Ctx, Verb } from "../pure/verb";

export type { Action } from "../pure/step-record";

/** One finished step, from EITHER path. Both send ACTIONS — never results — so
 *  both resolve through the one map below, and 3.2's "a person tapping a control
 *  and the agent calling a tool resolve to the identical Command" is true rather
 *  than aspirational.
 *
 *  IT CARRIES NO `Actor`, AND THAT ABSENCE IS THE INVARIANT. `by` used to be a
 *  field here, which made WHO ACTED a claim the payload made about itself: the
 *  boundary fed it verbatim to `authorityOf(step.by, session)`, so anything that
 *  could reach this seam chose its own attribution AND its own principal. That is
 *  the class `Signature` closed one layer down (spine/pure/actor), and it is
 *  closed here the same way — by making the value UNREPRESENTABLE rather than
 *  merely unused.
 *
 *  NO NAME-KEYED RULE COULD HAVE DONE IT IN THIS PORT. `Actor` is a string-literal
 *  union, so `by: "Spine"` is a bare literal in an object literal: no import, no
 *  identifier, nothing for a rule keyed on a name to see — and a hoisted
 *  `const b = "Spine"` or an `as Actor` assertion evades a rule keyed on the
 *  literal too. Deleting the field is what a lint could not reach. */
export interface FinishedStep {
  readonly staged: readonly StagedInput[];
  readonly actions: readonly Action[];
}

/** THE ACTOR RIDES THE CHANNEL, not the payload — one channel per `Actor` value,
 *  each minted by the boundary and handed to exactly one owner at wiring: the
 *  surface controller gets `human`, the agent loop and every turn get `agent`,
 *  and the serial consumer's own authored steps get `spine`.
 *
 *  This is what §5.3's "decided by where it entered, never by what it asks for"
 *  costs to make TRUE. A holder stamps what its channel stamps and nothing else,
 *  so the agent path can no longer claim `Human`, and `spine:consumer` — the one
 *  principal in the reference wiring with no credential behind it, minted to mean
 *  "no model chose this" — is reachable only from the consumer that owns it.
 *
 *  NAMED RESIDUE, because "unforgeable" would be a lie: the composition root
 *  constructs the boundary and therefore holds all three channels, exactly as it
 *  holds the authorization seam that decides what each Actor resolves to. That is
 *  the residue `spine/boundary` already has for `Signature` — the minting folder
 *  can mint. What is closed is every holder that is NOT the root: a tool, a fold
 *  arm, a turn, the surface, the agent loop. */
export interface StepChannel {
  submit(step: FinishedStep): StepIndex;
}

export type Registry<S> = ReadonlyMap<ToolName, Verb<S>>;

export function registryOf<S>(verbs: readonly Verb<S>[]): Registry<S> {
  return new Map(verbs.map((v) => [v.name, v]));
}

/** name → ToolResult. Closed, boundary-owned, pre-fold.
 *
 *  IT IS ALSO WHERE THE SEAL IS APPLIED, and that is what makes "one production
 *  site" a property of the TYPE rather than of a key-named lint. A verb body
 *  returns a plain literal — block authoring is untouched — and this line is
 *  the only place a live result becomes something the fold, the gate and a
 *  committed record will accept. `{ ...received }` in a fold arm produces a
 *  value none of the three take (spine/pure/tool-result). */
export function resolveAction<S>(registry: Registry<S>, action: Action, ctx: Ctx<S>): SealedResult {
  const verb = registry.get(action.tool);
  if (verb === undefined) return seal(unhandled(action.tool, "no registered verb"));
  const decoded = verb.decode(action.input);
  if (!decoded.ok) return seal(unhandled(action.tool, "input failed to decode"));
  // TOTAL, AND THE FILE HEADER ALREADY PROMISED IT — "the spine never throws at
  // a seam" was false here until this landed. A verb body that threw propagated
  // out of the ONE production site, through `Boundary.submit`, into the agent
  // loop's `onStepFinish`; the runtime's callback notification swallows it, and
  // the turn resolved with the step's record NEVER APPENDED. The action vanished:
  // no ok, no refusal, no `Unhandled` — nothing on the timeline at all, which is
  // the one outcome this architecture does not permit (6.10, and the "nothing
  // the consumer sheds is silent" rule the mailbox path already holds).
  //
  // A throwing body is a DEFECT, and a defect is still a decision someone may
  // need to ask about — so it commits as `Unhandled` and travels the same single
  // path as every other result rather than being special-cased into silence.
  try {
    return seal(verb.run(decoded.input, ctx));
  } catch {
    return seal(unhandled(action.tool, "tool body failed"));
  }
}

/** name → Command. The other half of the same registration (6.8). Under it
 *  EVERY verb signs — presentation and domain alike — and so do the spine's own
 *  two cases, because a refusal is a decision someone may need to ask about. */
export function signResult<S>(
  registry: Registry<S>,
  result: SealedResult,
  sig: Signature,
  id: CommandId,
): SealedCommand {
  if (isSpineResult(result)) {
    switch (result.outcome) {
      case "unhandled": {
        const cmd: SpineCommand = {
          outcome: "unhandled",
          tool: result.tool,
          sig,
          id,
          note: result.note,
        };
        return seal(cmd);
      }
      case "refused": {
        const cmd: SpineCommand = {
          outcome: "refused",
          tool: result.tool,
          sig,
          id,
          reason: result.reason,
        };
        return seal(cmd);
      }
      default: {
        const _never: never = result;
        return _never;
      }
    }
  }
  const verb = registry.get(result.tool);
  // Unreachable: an "ok" result can only have come out of a registered verb's
  // own `run`, six lines up. Total anyway — the spine never throws at a seam.
  if (verb === undefined) {
    const cmd: SpineCommand = {
      outcome: "unhandled",
      tool: result.tool,
      sig,
      id,
      note: "no registered verb",
    };
    return seal(cmd);
  }
  // A COMMAND MAY ONLY CARRY THE STAMP THIS STEP MINTED — checked by IDENTITY,
  // and this is the ONLY layer that closes the constructed-forge class.
  //
  // `CommandBase.sig` (pure/command.ts) is the ONLY Signature-typed value block
  // code can emit — `ArmOut` and `FoldOut` carry none — and `verb.sign` has
  // exactly ONE call site, which is this line. So reference equality here is
  // TOTAL over "a forged stamp reaching committed transport", where no
  // type-level wall can be: `Object.assign`'s `T & U`, `structuredClone`'s
  // `T -> T`, any user-written `<T>(t: T, o: Partial<T>) => T` or
  // `<T, K extends keyof T>(t: T, k: K, v: T[K]) => T`, and
  // `new (sig.constructor as new (…) => Signature)(…)` reflection — the last of
  // which produces a REAL branded, frozen Signature, so no shape check could
  // ever catch it — all yield values the compiler accepts as `Signature` no
  // matter how the brand is spelled. Every one of them fails to be THIS object.
  //
  // Total, not a throw: the "no registered verb" fallback ten lines up is the
  // idiom to mirror, and this file's header already says the spine never throws
  // at a seam. A refusal is a decision, so it is signed — with the stamp the
  // boundary minted, never the one the verb handed back.
  const cmd = verb.sign(result, sig, id);
  if (cmd.sig !== sig) {
    const refused: SpineCommand = {
      outcome: "refused",
      tool: result.tool,
      sig,
      id,
      reason: "forged signature",
    };
    return seal(refused);
  }
  return seal(cmd);
}

// ── WHICH CALLS A STEP MAY ADMIT ────────────────────────────────────────────
// These live HERE and not in `spine/agent/loop` because C14 refused them there,
// for the fourth time this session and correctly every time: deciding which
// calls a step may commit IS a decision, and the loop makes none. This module
// already owns `FinishedStep`, `StepChannel` and the one name->ToolResult map,
// so the admission rule belongs beside the shape it admits into. Nothing below
// names the runtime; the parameters are structural.

export interface AdmittedToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  /** the runtime's OWNERSHIP BIT — true when the PROVIDER executed the call */
  readonly providerExecuted?: boolean;
}

export function admittedCalls(
  toolCalls: readonly AdmittedToolCall[],
  content: readonly unknown[],
): readonly { tool: string; input: unknown }[] {
  const withheld = new Set(
    content
      .filter(
        (part): part is { type: string; toolCall: { toolCallId: string } } =>
          (part as { type?: string }).type === "tool-approval-request",
      )
      .map((part) => part.toolCall.toolCallId),
  );
  return toolCalls
    .filter(
      (call) =>
        // PROVIDER-OWNED CALLS ARE NOT OURS TO RECORD. `toolCalls` also carries
        // calls the PROVIDER executed, whose local `execute` is deliberately
        // skipped. Submitting one made the boundary resolve a name its registry
        // never had and commit `Unhandled("no registered verb")` — a record
        // describing an action this boundary never owned, which is a subtler lie
        // than dropping it: the timeline claims the local system saw and refused
        // something that was never its business.
        call.providerExecuted !== true &&
        // WITHHELD PENDING APPROVAL. See the note at the submit seam.
        !withheld.has(call.toolCallId),
    )
    .map((call) => ({ tool: call.toolName, input: call.input }));
}

/** THE WHOLE CALLBACK-TO-CHANNEL ADAPTER, extracted so the WIRING is testable
 *  and not just the predicate.
 *
 *  Review finding: with only `admittedCalls` exported, reverting `onStepFinish`
 *  to a direct `toolCalls.map(...)` left every test green while a withheld call
 *  could commit again. The unsafe bypass has to be a deterministic failure, and
 *  it cannot be while the seam that must call the filter is unreachable from a
 *  test. */
export function submitFinishedStep(
  channel: StepChannel,
  staged: readonly StagedInput[],
  toolCalls: readonly AdmittedToolCall[],
  content: readonly unknown[],
): StepIndex {
  return channel.submit({ staged, actions: admittedCalls(toolCalls, content) });
}
