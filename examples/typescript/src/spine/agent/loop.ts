// ── spine/agent/loop — the loop is a DECLARATION (G3, I5) ──────────────────
// The ONLY file in the system that imports the agent-loop runtime (the Vercel
// AI SDK). It converts the registry's verb table into SDK tools and hooks the
// boundary onto `onStepFinish` — that callback IS the boundary seam. There is
// no domain logic here, no branching, and no state (check C14).
//
// IT FORWARDS ACTIONS, NOT RESULTS (F1/§3.1). The SDK's serialized tool output
// never reaches the fold; what reaches the fold is what `resolveAction`
// produced from the model's RAW input. That makes `resolveAction` the single
// production site of every ToolResult in the system, so a recorded result can
// never disagree with what the boundary folded.
//
// PRICE, STATED PLAINLY: the pure tool body runs TWICE per agent action — once
// in `execute` so the model gets a payload-rich result to reason over, once at
// the boundary to produce the recorded truth. A pure function evaluated twice
// is free, and that is the price of one production site. (See the matching
// comment at the second call site in `spine/boundary/action.ts`.)

import { generateText, stepCountIs, tool, type LanguageModel, type ToolSet } from "ai";
import type { StagedInput } from "../pure/staged";
import type { Ctx, Verb } from "../pure/verb";
import type { Registry } from "../boundary/action";
import type { Boundary } from "../boundary/boundary";
import type { Dispatchers } from "../pure/verb";

type FlexibleInputSchema = Parameters<typeof tool>[0]["inputSchema"];

/** The verb table → the SDK's tool set. One row per registered verb; a
 *  presentation verb and a domain verb produce identical rows (A1). */
export function buildTools<S>(
  registry: Registry<S>,
  boundary: Boundary<S>,
  dispatchers: Dispatchers<S>,
  staged: readonly StagedInput[],
): ToolSet {
  const ctx = (): Ctx<S> => ({
    state: boundary.state,
    context: dispatchers.projectContext(boundary.state, staged),
  });
  const entry = (verb: Verb<S>): [string, ToolSet[string]] => [
    verb.name,
    tool({
      description: verb.describe,
      // the spine never interprets a schema; only this adapter does
      inputSchema: verb.schema as FlexibleInputSchema,
      // runs the PURE body so the model has something to reason over; the
      // recorded truth is produced again at the boundary, from the raw input
      execute: async (input: unknown) => verb.run(input, ctx()),
    }),
  ];
  return Object.fromEntries([...registry.values()].map(entry));
}

export interface RunTurn<S> {
  readonly model: LanguageModel;
  readonly prompt: string;
  readonly boundary: Boundary<S>;
  readonly registry: Registry<S>;
  readonly dispatchers: Dispatchers<S>;
  readonly staged?: readonly StagedInput[];
}

export async function runTurn<S>(opts: RunTurn<S>): Promise<{ steps: number; text: string }> {
  const staged = opts.staged ?? [];
  const result = await generateText({
    model: opts.model,
    tools: buildTools(opts.registry, opts.boundary, opts.dispatchers, staged),
    stopWhen: stepCountIs(8),
    prompt: opts.prompt,
    // THE BOUNDARY SEAM. Actions in — the model's raw input, unresolved.
    onStepFinish: ({ toolCalls }) =>
      void opts.boundary.onStepFinish({
        by: "Agent",
        staged,
        actions: toolCalls.map((call) => ({ tool: call.toolName, input: call.input })),
      }),
  });
  return { steps: result.steps.length, text: result.text };
}
