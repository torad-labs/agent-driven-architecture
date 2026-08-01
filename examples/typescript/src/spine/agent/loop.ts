// ── spine/agent/loop — the loop is a DECLARATION (G3) ──────────────────
// The ONLY file in the system that imports the agent-loop runtime (the Vercel
// AI SDK). It converts the registry's verb table into SDK tools and hooks the
// boundary onto `onStepFinish` — that callback IS the boundary seam. There is
// no domain logic here, no branching, and no state (check C14).
//
// IT FORWARDS ACTIONS, NOT RESULTS (G1/§3.1). The SDK's serialized tool output
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

import { toJsonSchema } from "@valibot/to-json-schema";
import { generateText, jsonSchema, type LanguageModel, stepCountIs, type ToolSet, tool } from "ai";
import type { Registry } from "../boundary/action";
import type { Boundary } from "../boundary/boundary";
import type { StagedInput } from "../pure/staged";
import type { Ctx, Dispatchers, Verb } from "../pure/verb";

type FlexibleInputSchema = Parameters<typeof tool>[0]["inputSchema"];

/** The verb table → the SDK's tool set. One row per registered verb; a
 *  presentation verb and a domain verb produce identical rows (6.8). */
export function buildTools<S>(
  registry: Registry<S>,
  boundary: Boundary<S>,
  dispatchers: Dispatchers<S>,
  staged: readonly StagedInput[],
): ToolSet {
  const ctx = (): Ctx<S> => ({
    state: boundary.state,
    // the bound comes from the BOUNDARY, never re-defaulted here: the tools
    // must read exactly the window the committed digest was derived under
    // (docs/DECISIONS.md:174).
    context: dispatchers.projectContext(boundary.state, staged, boundary.contextBounds),
  });
  const entry = (verb: Verb<S>): [string, ToolSet[string]] => [
    verb.name,
    tool({
      description: verb.describe,
      // THE SPINE NEVER INTERPRETS A SCHEMA; ONLY THIS ADAPTER DOES — and this is
      // where that sentence earns its keep. A block writes a Valibot schema, the spine
      // types it as a Standard Schema and only ever calls `~standard.validate`, and the
      // runtime wants JSON Schema for the model-facing tool definition. The SDK reads
      // `~standard.jsonSchema.input`, an extension Valibot 1.4 does not ship, so the
      // conversion happens HERE rather than by constraining what a block may write.
      inputSchema: jsonSchema(
        toJsonSchema(verb.schema as Parameters<typeof toJsonSchema>[0]),
      ) as FlexibleInputSchema,
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
  // A declared default, not a `??` decision: C14 counts expression-level
  // branches now, and this is the TS spelling of Kotlin's defaulted parameter.
  const { staged = [] } = opts;
  const result = await generateText({
    model: opts.model,
    tools: buildTools(opts.registry, opts.boundary, opts.dispatchers, staged),
    stopWhen: stepCountIs(8),
    prompt: opts.prompt,
    // THE BOUNDARY SEAM. Actions in — the model's raw input, unresolved.
    // THE AGENT CHANNEL, and it is the only one this path can reach: the step it
    // builds carries no Actor field, so nothing that drove these tool calls can
    // promote itself to `Human` or to the consumer's `Spine`.
    onStepFinish: ({ toolCalls }) =>
      void opts.boundary.agent.submit({
        staged,
        actions: toolCalls.map((call) => ({ tool: call.toolName, input: call.input })),
      }),
  });
  return { steps: result.steps.length, text: result.text };
}
