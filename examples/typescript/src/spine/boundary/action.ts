// ── spine/boundary/action — the ONE name→ToolResult map (F1) ───────────────
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

import type { Actor, Signature } from "../pure/actor";
import type { CommandBase, SpineCommand } from "../pure/command";
import type { CommandId, ToolName } from "../pure/ids";
import type { StagedInput } from "../pure/staged";
import type { Action } from "../pure/step-record";
import type { ToolResultBase } from "../pure/tool-result";
import { isSpineResult, unhandled } from "../pure/tool-result";
import type { Ctx, Verb } from "../pure/verb";

export type { Action } from "../pure/step-record";

/** One finished step, from EITHER path. The agent loop supplies `by = "Agent"`;
 *  the surface controller supplies `by = "Human"`. Both send ACTIONS — never
 *  results — so both resolve through the one map below, and 3.2's "a person
 *  tapping a control and the agent calling a tool resolve to the identical
 *  Command" is true rather than aspirational. */
export interface FinishedStep {
  readonly by: Actor;
  readonly staged: readonly StagedInput[];
  readonly actions: readonly Action[];
}

export type Registry<S> = ReadonlyMap<ToolName, Verb<S>>;

export function registryOf<S>(verbs: readonly Verb<S>[]): Registry<S> {
  return new Map(verbs.map((v) => [v.name, v]));
}

/** name → ToolResult. Closed, boundary-owned, pre-fold. */
export function resolveAction<S>(
  registry: Registry<S>,
  action: Action,
  ctx: Ctx<S>,
): ToolResultBase {
  const verb = registry.get(action.tool);
  if (verb === undefined) return unhandled(action.tool, "no registered verb");
  const decoded = verb.decode(action.input);
  if (!decoded.ok) return unhandled(action.tool, "input failed to decode");
  return verb.run(decoded.input, ctx);
}

/** name → Command. The other half of the same registration (6.8). Under A1
 *  EVERY verb signs — presentation and domain alike — and so do the spine's own
 *  two cases, because a refusal is a decision someone may need to ask about. */
export function signResult<S>(
  registry: Registry<S>,
  result: ToolResultBase,
  sig: Signature,
  id: CommandId,
): CommandBase {
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
        return cmd;
      }
      case "refused": {
        const cmd: SpineCommand = {
          outcome: "refused",
          tool: result.tool,
          sig,
          id,
          reason: result.reason,
        };
        return cmd;
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
    return cmd;
  }
  return verb.sign(result, sig, id);
}
