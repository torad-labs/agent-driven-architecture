// ── spine/pure/verb — a registration, and what a tool may read (A1, F2) ─────
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
import type { Context } from "./context";
import type { EffectBase } from "./effect";
import type { CommandId, RawInput, Timestamp, ToolName } from "./ids";
import type { Notice } from "./notice";
import type { StagedInput } from "./staged";
import type { ToolResultBase } from "./tool-result";

// ── What a tool may read ────────────────────────────────────────────────────
// NO actor. NO authority. NO Signature. Deleting `ctx.actor` is what makes an
// Actor UNREPRESENTABLE upstream of the boundary (F2/D4): a tool asking "who is
// asking?" is asking the wrong question, because the answer is stamped after it
// returns. The two-unreconciled-actor-values bug cannot recur, because there is
// only one value and it is created after the tool has returned.
export interface Ctx<S> {
  /** the committed snapshot, read-only */
  readonly state: S;
  /** the bounded projection the reasoner also saw (F4/G15) */
  readonly context: Context;
}

// ── Input decoding ──────────────────────────────────────────────────────────
// Structural, so `spine/pure` names no schema library. A zod schema satisfies
// it as-is; so does anything else with the same shape.
export interface InputSchema<I> {
  safeParse(raw: unknown): { readonly success: true; readonly data: I } | { readonly success: false };
}

export type DecodeResult = { readonly ok: true; readonly input: unknown } | { readonly ok: false };

// ── The typed spec a block writes ───────────────────────────────────────────
export interface VerbSpec<S, I, R extends ToolResultBase, C extends CommandBase> {
  /** D3 — the tool name IS the result's discriminant and the registry key */
  readonly name: R["tool"] & ToolName;
  /** the model-facing description */
  readonly describe: string;
  /** the input schema — model-facing AND the boundary's decoder */
  readonly schema: InputSchema<I>;
  /** the PURE tool body: reads ctx, returns a payload, mutates nothing */
  readonly run: (input: I, ctx: Ctx<S>) => R;
  /** the name→Command entry (6.8) */
  readonly sign: (result: R, sig: Signature, id: CommandId) => C;
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
      const parsed = spec.schema.safeParse(raw);
      return parsed.success ? { ok: true, input: parsed.data } : { ok: false };
    },
    run: (input, ctx) => spec.run(input as I, ctx),
    sign: (result, sig, id) => spec.sign(result as R, sig, id),
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

// ── What a fold arm returns (F9) ────────────────────────────────────────────
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
export interface FoldOut<S> {
  readonly state: S;
  readonly effects: readonly EffectBase[];
}

/** The two total dispatchers the impure seam needs. Declared with METHOD syntax
 *  deliberately: the app implements them over its own CLOSED unions
 *  (`readonly ToolResult[]`), while the spine may only name the open base. */
export interface Dispatchers<S> {
  fold(state: S, results: readonly ToolResultBase[], now: Timestamp, sig: Signature): FoldOut<S>;
  projectContext(state: S, staged: readonly StagedInput[]): Context;
}

/** A block's ONE public contribution to the composition root (L1, I7). */
export interface BlockRegistration<S> {
  readonly block: string;
  readonly verbs: readonly Verb<S>[];
}
