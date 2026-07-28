// ── blocks/inbox/tools — the Verb table ────────────────────────────────────
// Both verbs are `Reversible`: recording that the system shed load changes no
// outside-world state and needs no second principal.
//
// These are ORDINARY verbs, and that is the whole reason the consumer needs no
// new spine machinery to be observable. The consumer emits an Action; the Action
// resolves through the one name→ToolResult map, passes the gate, folds, commits
// and signs. A busy-drop is a decision, so it signs — exactly like 6.8's
// presentation verbs. Wire a consumer without this block and the Action still
// resolves, to a committed `Unhandled`: still on the timeline, never silent.

import type { InferOutput } from "valibot";
import { literal, number, object, string, variant } from "valibot";
import type { Verb } from "../../spine/pure/verb";
import { reversible } from "../../spine/pure/verb";
import type {
  NoteDropCommand,
  NoteDropResult,
  NoteFaultCommand,
  NoteFaultResult,
} from "./contract";

const dropReason = variant("kind", [
  object({ kind: literal("Conflated"), source: string(), dropped: number() }),
  object({ kind: literal("Duplicate"), source: string(), key: string() }),
]);

export function inboxVerbs<S>(): readonly Verb<S>[] {
  return [
    reversible<S, { reason: InferOutput<typeof dropReason> }, NoteDropResult, NoteDropCommand>({
      name: "noteDrop",
      describe: "Record that an input was dropped — conflated away, or refused as a duplicate.",
      schema: object({ reason: dropReason }),
      run: (input) => ({ outcome: "ok", tool: "noteDrop", reason: input.reason }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "noteDrop",
        sig,
        id,
        reason: result.reason,
      }),
    }),
    reversible<S, { source: string; fault: string }, NoteFaultResult, NoteFaultCommand>({
      name: "noteFault",
      describe: "Record that a turn failed, or that a cancel exceeded its deadline.",
      schema: object({ source: string(), fault: string() }),
      run: (input) => ({
        outcome: "ok",
        tool: "noteFault",
        source: input.source,
        fault: input.fault,
      }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "noteFault",
        sig,
        id,
        source: result.source,
        fault: result.fault,
      }),
    }),
  ];
}
