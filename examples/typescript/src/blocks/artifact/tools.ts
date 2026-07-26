// ── blocks/artifact/tools — record, request, confirm ───────────────────────
// `recordFinding` and `requestSeal` are Reversible: writing a draft line and
// asking to seal are both undoable. `confirmSeal` is Irreversible — it is the
// canonical irreversible action 14.3 names, and sealing is what 12.2's Drain
// performs. Its `requestedBy` reads the pending authority off the seal status's
// PARENT-declared property, so the gate compares principals without this file
// knowing anything about authority at all.

import { object, string } from "valibot";
import type { Verb } from "../../spine/pure/verb";
import { irreversible, reversible } from "../../spine/pure/verb";
import type {
  ConfirmSealCommand,
  ConfirmSealResult,
  RecordFindingCommand,
  RecordFindingResult,
  RequestSealCommand,
  RequestSealResult,
} from "./contract";
import type { ArtifactSlice } from "./slice";

const nothing = object({});

export function artifactVerbs<S>(read: (state: S) => ArtifactSlice): readonly Verb<S>[] {
  return [
    reversible<S, { text: string }, RecordFindingResult, RecordFindingCommand>({
      name: "recordFinding",
      describe: "Append one line to the session's work product.",
      schema: object({ text: string() }),
      run: (input) => ({ outcome: "ok", tool: "recordFinding", text: input.text }),
      sign: (result, sig, id) => ({
        outcome: "ok",
        tool: "recordFinding",
        sig,
        id,
        text: result.text,
      }),
    }),
    reversible<S, Record<string, never>, RequestSealResult, RequestSealCommand>({
      name: "requestSeal",
      describe:
        "Request that the work product be sealed and delivered. Reversible; delivers nothing.",
      schema: nothing,
      run: () => ({ outcome: "ok", tool: "requestSeal" }),
      sign: (_result, sig, id) => ({ outcome: "ok", tool: "requestSeal", sig, id }),
    }),
    irreversible<S, Record<string, never>, ConfirmSealResult, ConfirmSealCommand>({
      name: "confirmSeal",
      describe: "Confirm the seal. IRREVERSIBLE: this delivers the work product.",
      schema: nothing,
      run: () => ({ outcome: "ok", tool: "confirmSeal" }),
      sign: (_result, sig, id) => ({ outcome: "ok", tool: "confirmSeal", sig, id }),
      requestedBy: (state) => read(state).seal.requestedBy,
    }),
  ];
}
