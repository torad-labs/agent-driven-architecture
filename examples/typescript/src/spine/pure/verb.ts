// ── spine/pure/verb — a registration, and what a tool may read (6.8, G1) ────
// ONE TOOL MECHANIC. 6.8's "a UI tool folds, does not sign" carve-out is gone.
// A presentation verb (focusTicket, setPanel) declares exactly what a domain
// verb declares — name, description, input schema, pure run, sign, and its
// reversibility classification — and costs exactly the same four appends. There
// is no second table and no cheaper UI path, because there is no UI path.
//
// `Verb` is SEALED (Reversible | Irreversible) and that is what makes 14.3's
// DEFAULT-DENY structural: there is no default. You pick a variant, and
// `Irreversible` cannot be constructed without saying where its matching
// Request lives (`requestedBy`). Registering a tool FORCES the classification
// decision, and the classification is a reviewed row in the registry.

import type { Authority, Signature } from "./actor";
import type { CommandBase } from "./command";
import type { Context, ContextBounds } from "./context";
import type { Attributed, EffectBase } from "./effect";
import type { CommandId, RawInput, Timestamp, ToolName } from "./ids";
import type { Notice } from "./notice";
import type { StagedInput } from "./staged";
import type { SealedResult, ToolResultBase } from "./tool-result";

// ── What a tool may read ────────────────────────────────────────────────────
// NO actor. NO authority. NO Signature. Deleting `ctx.actor` is what makes an
// Actor UNREPRESENTABLE upstream of the boundary (G1): a tool asking "who is
// asking?" is asking the wrong question, because the answer is stamped after it
// returns. The two-unreconciled-actor-values bug cannot recur, because there is
// only one value and it is created after the tool has returned.
export interface Ctx<S> {
  /** the committed snapshot, read-only */
  readonly state: S;
  /** the bounded projection the reasoner also saw (G15) */
  readonly context: Context;
}

// ── Input decoding ──────────────────────────────────────────────────────────
// The spine names a STANDARD, not a library.
//
// This used to declare `safeParse(raw) => { success, data }` and claim to be
// library-neutral because the shape was structural. It was not: that is zod's method
// and zod's field names. Valibot returns `{ success, output }` from a STANDALONE
// `safeParse(schema, input)`, so it could not satisfy the interface at all — the
// neutrality was a comment, not a property.
//
// Standard Schema (https://standardschema.dev) is the vendor-neutral contract both
// implement: a `~standard.validate` that returns `{ value }` on success and
// `{ issues }` on failure. Zod v4, Valibot v1 and ArkType all ship it, and the Vercel
// AI SDK accepts it directly for the model-facing tool definition — so ONE object
// serves both the reasoner's schema and the boundary's decoder, which is what 6.8
// requires.
export interface StandardResult<I> {
  readonly value?: I;
  readonly issues?: readonly unknown[];
}

export interface InputSchema<I> {
  readonly "~standard": {
    readonly validate: (value: unknown) => StandardResult<I> | Promise<StandardResult<I>>;
  };
}

export type DecodeResult = { readonly ok: true; readonly input: unknown } | { readonly ok: false };

// ── The typed spec a block writes ───────────────────────────────────────────
export interface VerbSpec<S, I, R extends ToolResultBase, C extends CommandBase> {
  /** 6.8 — the tool name IS the result's discriminant and the registry key */
  readonly name: R["tool"] & ToolName;
  /** the model-facing description */
  readonly describe: string;
  /** the input schema — model-facing AND the boundary's decoder */
  readonly schema: InputSchema<I>;
  /** the PURE tool body: reads ctx, returns a payload, mutates nothing */
  readonly run: (input: I, ctx: Ctx<S>) => R;
  /** the name→Command entry (6.8) */
  readonly sign: (result: R, sig: Signature, id: CommandId) => C;

  // ── THE MODEL-FACING SURFACE A BLOCK MAY DECLARE (SDK-1) ──────────────────
  // Until these existed, `VerbSpec` had slots for six things and the adapter was
  // a generic converter that knew nothing about any specific tool. A block
  // therefore COULD NOT express model-facing behaviour the runtime supports —
  // not because the spine forbade it, but because the type had nowhere to put
  // it. The Verb was a lossy intermediate representation over the runtime's own
  // tool definition, and every downstream absence followed from that one fact.
  //
  // ALL OPTIONAL, so no existing block moves. And all stated in the BLOCK'S OWN
  // vocabulary, never the runtime's: a block still names no SDK type, so the
  // "only one spine module imports the runtime" confinement is untouched. The
  // adapter translates — which is exactly the job it already had for schemas.

  /** Concrete inputs that show the reasoner what a good call looks like. Worth
   *  more than prose for a schema with a discriminated union or a format the
   *  description can only gesture at. */
  readonly examples?: readonly I[];

  /** Ask the provider to enforce the schema rather than merely advertise it,
   *  where the provider supports it. */
  readonly strict?: boolean;

  /** WHAT THE MODEL SEES, as distinct from what the boundary RECORDS.
   *
   *  The recorded truth is produced at the boundary from the raw input and is
   *  not negotiable (C7). This is the other half: a result that is large, or
   *  noisy, or carries a field the reasoner should not be steered by, can be
   *  summarised for the model without touching what the timeline commits.
   *
   *  Returns a plain string BY DESIGN — a block names no runtime type, and the
   *  adapter wraps it. */
  readonly toModelOutput?: (result: R) => string;

  // NO `needsApproval` HERE, AND ITS ABSENCE IS DELIBERATE (SDK-6, withdrawn
  // 2026-08-09 under review). It was added on the same "make it expressible"
  // reasoning as `toModelOutput` and `repairToolCall`. That reasoning does not
  // transfer, and shipping it proved so: those two are PURE PASSTHROUGHS, while
  // approval is a STATE MACHINE — request, decide, resume.
  //
  // With no resume path, declaring it did not add caution, it fabricated
  // history: the runtime withheld the call, `resolveAction` re-ran the pure body
  // at the boundary anyway (C7 cannot see that the runtime declined), and the
  // timeline committed `outcome: ok` for an action nobody authorised and nothing
  // executed. Measured on the shipped code: recordsBefore=0 -> recordsAfter=1
  // with the verb body's counter still at 0.
  //
  // Re-introducing it needs the whole lifecycle: `run` accepting prior messages,
  // the outcome surfacing the approval request, and a second generate to resume.
  // Until then the boundary gate is the only approval this port has, and it is
  // the one the book specifies.
}

// ── The type-erased registry entry ──────────────────────────────────────────
// The spine holds verbs for many different input and result types in one map,
// so the registry entry is erased to the shared base types. The two casts that
// erasure needs live HERE, in one file, and nowhere else in the system.
export interface VerbBase<S> {
  readonly kind: "Reversible" | "Irreversible";
  readonly name: ToolName;
  readonly describe: string;
  /** opaque to the spine; only the model-facing adapter interprets it */
  readonly schema: unknown;
  readonly decode: (raw: RawInput) => DecodeResult;
  readonly run: (input: unknown, ctx: Ctx<S>) => ToolResultBase;
  readonly sign: (result: ToolResultBase, sig: Signature, id: CommandId) => CommandBase;
  /** SDK-1's model-facing surface, erased alongside the rest. Opaque to the
   *  spine; only the model-facing adapter interprets them. */
  readonly examples?: readonly unknown[];
  readonly strict?: boolean;
  readonly toModelOutput?: (result: ToolResultBase) => string;
}

export interface ReversibleVerb<S> extends VerbBase<S> {
  readonly kind: "Reversible";
}

export interface IrreversibleVerb<S> extends VerbBase<S> {
  readonly kind: "Irreversible";
  /** where the matching Request lives — the authority that ASKED, read from
   *  committed State. `null` means "no pending request", which the gate refuses. */
  readonly requestedBy: (state: S, result: ToolResultBase) => Authority | null;
}

export type Verb<S> = ReversibleVerb<S> | IrreversibleVerb<S>;

function erase<S, I, R extends ToolResultBase, C extends CommandBase>(
  spec: VerbSpec<S, I, R, C>,
): Omit<VerbBase<S>, "kind"> {
  return {
    name: spec.name,
    describe: spec.describe,
    schema: spec.schema,
    decode: (raw) => {
      const parsed = spec.schema["~standard"].validate(raw);
      // A Standard Schema MAY validate asynchronously. Decoding runs inside the pure
      // fold path, which cannot await, so an async schema is a decode failure rather
      // than a silently-unresolved promise treated as a value.
      if (parsed instanceof Promise) return { ok: false };
      return parsed.issues === undefined && parsed.value !== undefined
        ? { ok: true, input: parsed.value }
        : { ok: false };
    },
    run: (input, ctx) => spec.run(input as I, ctx),
    sign: (result, sig, id) => spec.sign(result as R, sig, id),
    examples: spec.examples,
    strict: spec.strict,
    toModelOutput: spec.toModelOutput as ((result: ToolResultBase) => string) | undefined,
  };
}

export function reversible<S, I, R extends ToolResultBase, C extends CommandBase>(
  spec: VerbSpec<S, I, R, C>,
): ReversibleVerb<S> {
  return { kind: "Reversible", ...erase(spec) };
}

export function irreversible<S, I, R extends ToolResultBase, C extends CommandBase>(
  spec: VerbSpec<S, I, R, C> & { readonly requestedBy: (state: S, result: R) => Authority | null },
): IrreversibleVerb<S> {
  return {
    kind: "Irreversible",
    ...erase(spec),
    requestedBy: (state, result) => spec.requestedBy(state, result as R),
  };
}

// ── What a fold arm returns (12.4) ──────────────────────────────────────────
// Three rules, mechanical, no exceptions:
//   1. every arm reads current state before it decides;
//   2. every effect push lives INSIDE the success branch;
//   3. a rejection folds a per-item Notice, never the session-global RunStatus.
export interface ArmOut<S> {
  readonly slice: S;
  readonly effects: readonly EffectBase[];
  readonly notices: readonly Notice[];
}

export function armOut<S>(
  slice: S,
  effects: readonly EffectBase[] = [],
  notices: readonly Notice[] = [],
): ArmOut<S> {
  return { slice, effects, notices };
}

// ── What the root contributes back to the spine ─────────────────────────────
// `effects` is ATTRIBUTED, not bare. An `Attributed` has no `kind` and no `at`,
// so it is not an `EffectBase` and `keyedEffect(step, i, …)` will not take one:
// the only route from what the fold returned to what the sink performs is
// `admit` (spine/pure/effect.ts), which is what makes the refusal a property of
// the DERIVATION rather than of the live path (docs/DECISIONS.md:85).
export interface FoldOut<S> {
  readonly state: S;
  readonly effects: readonly Attributed[];
}

/** The two total dispatchers the impure seam needs. Declared with METHOD syntax
 *  deliberately: the app implements them over its own CLOSED unions
 *  (`readonly ToolResult[]`), while the spine may only name the open base. */
export interface Dispatchers<S> {
  fold(state: S, results: readonly SealedResult[], now: Timestamp, sig: Signature): FoldOut<S>;
  /** THE BOUND IS AN ARGUMENT, not a constant this function closes over
   *  (docs/DECISIONS.md:174). The boundary hands it the value the root wired,
   *  and replay can hand it a different one — which is the only way the
   *  committed digest can catch a bound that moved. */
  projectContext(state: S, staged: readonly StagedInput[], bounds: ContextBounds): Context;
}

/** A block's ONE public contribution to the composition root (G11). */
export interface BlockRegistration<S> {
  readonly block: string;
  readonly verbs: readonly Verb<S>[];
}

// ── SDK-1's DECLARED SURFACE, translated to neutral shapes ──────────────────
// These live here rather than in the model-facing adapter for one reason, and
// the gate is what supplied it: C14 refuses a decision inside
// `spine/agent/loop` — "the loop is a declaration, not a program". Deciding what
// an ABSENT declaration means is a decision, so it belongs beside the type that
// declares it.
//
// Neither function names a runtime type. They return neutral shapes the adapter
// hands straight over, so the "one module imports the runtime" confinement is
// untouched.

/** `undefined` in means `undefined` out. Handing the runtime an empty override
 *  instead of NO override would silently replace its own JSON serialisation with
 *  an empty string for every verb that never opted in. */
export function modelOutput<S>(
  verb: Verb<S>,
): ((options: { output: unknown }) => { type: "text"; value: string }) | undefined {
  const declared = verb.toModelOutput;
  if (declared === undefined) return undefined;
  return ({ output }) => ({ type: "text", value: declared(output as ToolResultBase) });
}

/** The runtime wants `[{ input }]`; a block writes the inputs themselves. */
export function inputExamples<S>(verb: Verb<S>): { input: never }[] | undefined {
  const declared = verb.examples;
  if (declared === undefined) return undefined;
  // The runtime types the example input against the tool's own INPUT type. The
  // registry is type-erased by construction (see `VerbBase` above), so the cast
  // is the same erasure this file already owns for `run` and `sign` — and it is
  // still confined to this one file.
  return declared.map((input) => ({ input })) as { input: never }[];
}

/** THE BLOCK'S OWN DECODER, in the shape the runtime's schema wants.
 *
 *  WHY THIS EXISTS (review finding, 2026-08-09). The adapter built the
 *  model-facing schema as `jsonSchema(toJsonSchema(verb.schema))` and passed no
 *  `validate`. A `jsonSchema()` built that way has NO validator — measured:
 *  `typeof schema.validate === "undefined"`. So the runtime accepted any input
 *  shape, `InvalidToolInputError` could never be raised, and
 *  `experimental_repairToolCall` was UNREACHABLE: a hook wired to a condition
 *  that could not occur. SDK-14 shipped calling it "expressible"; it was dead.
 *
 *  SAME CHECKER, TWICE. This returns the verb's own `decode` — the identical
 *  Standard Schema the BOUNDARY validates with. So the runtime and the boundary
 *  cannot disagree about what a valid input is, which is the property the port
 *  already relies on for the digest and the walls. C7 is untouched: the boundary
 *  still produces every recorded ToolResult from the raw input.
 *
 *  Returning `Error` rather than throwing: the runtime treats a failed validate
 *  as a repairable tool call, which is exactly the seam this restores. */
export function modelFacingValidate<S>(
  verb: Verb<S>,
): (value: unknown) => { success: true; value: unknown } | { success: false; error: Error } {
  return (value: unknown) => {
    const decoded = verb.decode(value as RawInput);
    if (!decoded.ok) {
      return { success: false, error: new Error(`input failed to decode for ${verb.name}`) };
    }
    return { success: true, value: decoded.input };
  };
}
