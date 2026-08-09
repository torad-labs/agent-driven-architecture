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
import {
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
  tool,
} from "ai";
import type { Registry, StepChannel } from "../boundary/action";
import type { TurnOutcome } from "../ports/model-provider";
import type { ContextBounds } from "../pure/context";
import { render } from "../pure/context";
import type { StagedInput } from "../pure/staged";
import { scopeOf, type TurnScope } from "../pure/staged";
import type { Ctx, Dispatchers, Verb } from "../pure/verb";
import { inputExamples, modelFacingValidate, modelOutput } from "../pure/verb";

type FlexibleInputSchema = Parameters<typeof tool>[0]["inputSchema"];

/** WHAT THIS PATH MAY REACH, and it is the type that says so — the idiom
 *  `spine/surface/controller.ts` and `spine/concurrency/consumer.ts` already
 *  use. The agent loop held the whole `Boundary` while its own comment claimed
 *  the agent channel "is the only one this path can reach"; a review measured
 *  that false — `boundary.human.submit` compiled fine from here, so a
 *  model-driven step could be stamped `Human`. The confinement is `tsc` now,
 *  not a sentence: this seam names the agent channel and the two reads the
 *  tools need, and no other channel is on the type at all. */
export interface AgentSeam<S> {
  readonly state: S;
  readonly contextBounds: ContextBounds;
  readonly agent: StepChannel;
}

/** The verb table → the SDK's tool set. One row per registered verb; a
 *  presentation verb and a domain verb produce identical rows (6.8).
 *
 *  BUILT ONCE PER REGISTRY, not once per turn: nothing in here varies with the
 *  turn any more. */
export function buildTools<S>(
  registry: Registry<S>,
  boundary: AgentSeam<S>,
  dispatchers: Dispatchers<S>,
): ToolSet {
  const ctx = (staged: readonly StagedInput[]): Ctx<S> => ({
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
      // The second argument is what makes the runtime actually CHECK. Without
      // it the schema is advertised and never enforced, which left
      // `repairToolCall` wired to a condition that could not occur. The
      // validator is the block's own decoder, so the runtime and the boundary
      // agree by construction (spine/pure/verb).
      inputSchema: jsonSchema(toJsonSchema(verb.schema as Parameters<typeof toJsonSchema>[0]), {
        validate: modelFacingValidate(verb),
      }) as FlexibleInputSchema,
      // runs the PURE body so the model has something to reason over; the
      // recorded truth is produced again at the boundary, from the raw input.
      // The turn's staged input arrives through the CALL's context, which is
      // what lets this table be built once and reused across turns.
      execute: async (input: unknown, options: { experimental_context?: unknown }) =>
        verb.run(input, ctx(scopeOf(options.experimental_context).staged)),
      // ── SDK-1: what the BLOCK declared, translated ─────────────────────────
      // The block wrote these in its own vocabulary and named no runtime type.
      // This is the same job the adapter already does for schemas: the spine
      // never interprets them, and this file is the only place that may.
      inputExamples: inputExamples(verb),
      strict: verb.strict,
      toModelOutput: modelOutput(verb),
    }),
  ];
  return Object.fromEntries([...registry.values()].map(entry));
}

/** THE SHIPPED STEP CEILING. A default, not the law — the law is that a ceiling
 *  EXISTS and the ROOT sets it, the same move `contextBounds` already made. It
 *  was `stepCountIs(8)` welded into the call while every comparable knob
 *  (`promptVersion`, `reducerVersion`, `contextBounds`) was deliberately
 *  root-owned, which is the one inconsistency this port stated and then broke. */
export const DEFAULT_MAX_STEPS = 8;

/** WHAT THE ROOT DECLARES ONCE (G3, and the reason this file is called a
 *  DECLARATION). `ToolLoopAgent` is the SDK's own answer to "an agent is a model
 *  plus a tool table plus loop settings, reused across turns", and the docs name
 *  it the recommended approach; core functions are for when you need explicit
 *  control of every step. This port took the escape hatch as its default while
 *  its whole thesis is declarative composition from a registry — and rebuilt the
 *  entire tool table on every single turn to do it. */
export interface AgentDeclaration<S> {
  readonly model: LanguageModel;
  readonly instructions?: string;
  readonly boundary: AgentSeam<S>;
  readonly registry: Registry<S>;
  readonly dispatchers: Dispatchers<S>;
  /** the root's step ceiling; omitted, the shipped default applies */
  readonly maxSteps?: number;
  /** NARROWING WITHIN A REGISTRY (11.4 is untouched).
   *
   *  The registry allowlist answers "may this stream EVER run this verb?" and
   *  stays the authority on that — a tier that must not hold a verb still must
   *  not hold it. This answers the different question the registry cannot:
   *  "may it run it right now?", per declaration and per step, without forking
   *  the table.
   *
   *  What it buys beyond tidiness: an unlisted verb is not OFFERED to the model
   *  at all, so a restriction stops depending on the model declining to call
   *  something it can see. Omitted, every registered verb is offered. */
  readonly activeTools?: readonly string[];

  // ── CALL SETTINGS, ROOT-OWNED (SDK-16) ────────────────────────────────────
  // None of these were set at all. All optional, so an app that names none is
  // byte-identical to before.
  //
  // `seed` IS THE ONE THAT MATTERS HERE, and not for generic tidiness: this
  // repository's whole argument is a replayable, deterministic command timeline
  // — replay re-derives state and the context digest from committed bytes and
  // compares. A port that stakes its case on determinism and leaves the one
  // determinism knob the runtime offers unset was arguing against itself.
  //
  // It does NOT make a model deterministic on its own (that is the provider's
  // to honour, where it can). What it does is make the intent expressible and
  // reviewable instead of absent.
  readonly seed?: number;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  /** how many times the runtime retries a failed request; the SDK default is 2 */
  readonly maxRetries?: number;

  /** TOOL-CALL REPAIR (SDK-14), supplied by the ROOT and never decided here.
   *
   *  Today a malformed tool input becomes a committed `Unhandled` at the
   *  boundary ("input failed to decode") and the turn carries on. That refusal
   *  is a book law and is NOT what this replaces: repair runs BEFORE the
   *  boundary, so an input that can be fixed never becomes a refusal, and one
   *  that cannot still lands as a committed Unhandled exactly as before.
   *
   *  A PASSTHROUGH, deliberately. Choosing how to repair is a decision, and C14
   *  says the loop makes none — the root supplies the strategy or supplies
   *  nothing. */
  readonly repairToolCall?: NonNullable<
    ConstructorParameters<typeof ToolLoopAgent>[0]["experimental_repairToolCall"]
  >;
}

/** The per-turn inputs, declared as the agent's CALL OPTIONS so that one agent
 *  serves every turn. `prepareCall` turns them into the call's context, which is
 *  what `prepareStep` and every tool's `execute` then read. */
const CALL_OPTIONS_SCHEMA = jsonSchema<TurnScope>({ type: "object" });

/** The tool calls a step may commit: every call the runtime ATTEMPTED, minus any
 *  it withheld pending approval. Exported so the refusal is testable on its own
 *  rather than only through a whole turn. */
export function admittedCalls(
  toolCalls: readonly { toolCallId: string; toolName: string; input: unknown }[],
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
    .filter((call) => !withheld.has(call.toolCallId))
    .map((call) => ({ tool: call.toolName, input: call.input }));
}

/** One turn's inputs. Everything that varies; nothing that does not. */
export interface Turn {
  readonly prompt: string;
  readonly staged?: readonly StagedInput[];
  readonly abortSignal?: AbortSignal;
}

/** The declared agent, plus the one thing you do with it. `tools` is exposed for
 *  exactly one reason: a test can hold the table across two turns and assert it
 *  is the SAME OBJECT, which is the only way "built once" is a fact rather than
 *  a claim about code shape. */
export interface DeclaredAgent {
  readonly tools: ToolSet;
  run(turn: Turn): Promise<TurnOutcome>;
}

export function declareAgent<S>(declaration: AgentDeclaration<S>): DeclaredAgent {
  const { maxSteps = DEFAULT_MAX_STEPS } = declaration;
  const boundary = declaration.boundary;
  const dispatchers = declaration.dispatchers;

  // THE REASONER'S INPUT, ACTUALLY SENT (G15) — see the long note below on why
  // this is per-step and why the equality with the committed digest is exact.
  const reasonerInput = (staged: readonly StagedInput[]): ModelMessage => ({
    role: "user",
    content: render(dispatchers.projectContext(boundary.state, staged, boundary.contextBounds)),
  });

  // BUILT ONCE. This is the whole point: the table is a function of the
  // registry, and the registry does not change between turns.
  const tools = buildTools(declaration.registry, boundary, dispatchers);

  const agent = new ToolLoopAgent<TurnScope, ToolSet>({
    model: declaration.model,
    // THE INSTRUCTION CHANNEL, separate by construction from the input channel.
    // Nothing a source staged can reach it (SDK-22).
    instructions: declaration.instructions,
    tools,
    activeTools: declaration.activeTools as string[] | undefined,
    experimental_repairToolCall: declaration.repairToolCall,
    seed: declaration.seed,
    temperature: declaration.temperature,
    maxOutputTokens: declaration.maxOutputTokens,
    maxRetries: declaration.maxRetries,
    stopWhen: stepCountIs(maxSteps),
    callOptionsSchema: CALL_OPTIONS_SCHEMA,
    // per-turn values become the CALL's context, reaching both `prepareStep`
    // below and every tool's `execute`
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      experimental_context: options,
    }),
    prepareStep: ({ messages, experimental_context }) => ({
      messages: [reasonerInput(scopeOf(experimental_context).staged), ...messages],
    }),
  });

  return {
    tools,
    async run(turn: Turn): Promise<TurnOutcome> {
      // A declared default, not a `??` decision: C14 counts expression-level
      // branches, and this is the TS spelling of Kotlin's defaulted parameter.
      const { staged = [] } = turn;
      const result = await agent.generate({
        prompt: turn.prompt,
        options: { staged },
        // The consumer's deadline reaches the WIRE here, which is what makes the
        // committed "turn abandoned" fault true rather than aspirational (12.4).
        abortSignal: turn.abortSignal,
        // THE BOUNDARY SEAM, and it is PER CALL for a reason the agent shape
        // forces: the step it submits carries this turn's `staged`, so it cannot
        // live on a declaration that outlives the turn.
        //
        // THE AGENT CHANNEL, and it is the only one this path can reach — a fact
        // of the TYPE (`AgentSeam`) and not only of the payload: the step carries
        // no Actor field to forge, and the other two channels are not even named
        // on what this path holds.
        // WITHHELD CALLS MUST NOT COMMIT — review finding, reproduced before
        // fixing. `toolCalls` includes calls the runtime DECLINED to execute
        // pending approval. Submitting them anyway committed `outcome: ok` for
        // an action nobody authorised and nothing ran: measured
        // recordsBefore=0 -> recordsAfter=1 with the verb body's own counter
        // still at 0. `resolveAction` re-runs the PURE body at the boundary
        // (C7), so it cannot tell that the runtime withheld the call — which is
        // precisely why the filter has to happen HERE, on the way in.
        //
        // IT FILTERS ON THE APPROVAL PART, NOT ON `toolResults`. Correlating
        // against `toolResults` also drops calls whose `execute` THREW, and
        // those must still reach the boundary: their recorded truth comes from
        // the pure re-run, not from the runtime's copy, and dropping them would
        // trade one silent commit for one silent omission. This excludes
        // exactly what was withheld and nothing else.
        onStepFinish: ({ toolCalls, content }) =>
          void boundary.agent.submit({
            staged,
            actions: admittedCalls(toolCalls, content),
          }),
      });
      // WHAT THE SEAM USED TO THROW AWAY. `{ steps, text }` discarded usage,
      // finishReason, warnings and every other field the runtime returned, so a
      // caller could not tell a complete answer from a TRUNCATED one and could
      // not bill a turn at all.
      //
      // `totalUsage`, never `usage`: the latter is the FINAL STEP only, and
      // reporting it would under-bill every turn that used a tool. (At v7 this
      // inverts — `usage` accumulates and `totalUsage` is deprecated — which is
      // exactly why SDK-0's version ruling is recorded against this line.)
      //
      // Destructuring defaults rather than `??`: C14 counts an expression-level
      // logical chain as a decision the loop may not make, and these fields are
      // `number | undefined` at the seam.
      const { inputTokens = 0, outputTokens = 0 } = result.totalUsage;
      const { warnings = [] } = result;
      return {
        steps: result.steps.length,
        text: result.text,
        finishReason: result.finishReason,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        warnings: warnings.map((warning) => JSON.stringify(warning)),
      };
    },
  };
}

export interface RunTurn<S> {
  readonly model: LanguageModel;
  /** THE PROMPT ASSET (7.3, 14.7) — the thing `promptVersion` versions.
   *
   *  It had no field before this, which made `context.promptVersion` on every
   *  committed record a version tag over an ABSENT asset: a value that cannot
   *  disagree with reality is not provenance, and it is the same class the
   *  digest was in before G15's seam was actually wired.
   *
   *  IT IS ITS OWN CHANNEL, and that is the invariant rather than a preference.
   *  The projected context embeds `Perceived` bodies, which `spine/pure/staged`
   *  declares UNTRUSTED; this is the INSTRUCTION channel. The SDK rejects system
   *  messages inside `prompt`/`messages` by default and names prompt injection
   *  as the reason. Merging the two into one string is the shape that rule
   *  exists to refuse — so there is no code path from a staged body to here. */
  readonly instructions?: string;
  readonly prompt: string;
  /** THE TURN'S CANCELLATION, forwarded to the provider (12.4).
   *
   *  `TurnContext.signal` (spine/concurrency/consumer) has always been a real
   *  AbortSignal, and `cancelDeadlineMs` has always committed a fault reading
   *  "turn abandoned, its channel revoked". There was simply no parameter here
   *  to accept it, so no TurnRunner could pass it through — and the timeline
   *  asserted an abandonment the world never performed, while the request kept
   *  running and kept billing. Optional, because cancellation is opt-in: an app
   *  with no deadline pays nothing. */
  readonly abortSignal?: AbortSignal;
  readonly boundary: AgentSeam<S>;
  readonly registry: Registry<S>;
  readonly dispatchers: Dispatchers<S>;
  readonly staged?: readonly StagedInput[];
  /** the root's step ceiling; omitted, the shipped default applies */
  readonly maxSteps?: number;
}

/** ONE TURN, ONE-SHOT — the convenience entry, and it is now a THIN wrapper.
 *
 *  It declares an agent and runs a single turn, which means the tool table is
 *  built for that turn and thrown away. That is the right trade for a caller who
 *  genuinely runs once (the worked demo's opening turn, a test), and the WRONG
 *  one for a consumer driving many turns — which is every real deployment.
 *  Those call `declareAgent` at wiring and reuse the handle, which is the whole
 *  reason the declaration is a separate, exported thing.
 *
 *  There is exactly ONE implementation underneath either way: this function
 *  cannot drift from the reusable path, because it IS the reusable path.
 */
export async function runTurn<S>(opts: RunTurn<S>): Promise<TurnOutcome> {
  return declareAgent({
    model: opts.model,
    instructions: opts.instructions,
    boundary: opts.boundary,
    registry: opts.registry,
    dispatchers: opts.dispatchers,
    maxSteps: opts.maxSteps,
  }).run({ prompt: opts.prompt, staged: opts.staged, abortSignal: opts.abortSignal });
}
