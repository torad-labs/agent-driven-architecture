// ── spine/pure/effect — the sealed ROOT of what the fold RETURNS (G12, G9) ──
// The base declares `at`. That is the G12 demonstration in miniature: the
// shipped reference had a `Diag` with no timestamp; now every effect in the
// system carries one BY CONSTRUCTION, because the shared field is declared on
// the parent exactly once.
//
// NO ID FIELD, EVER (G9).      The fold's return type is `Effect[]`, so any
// `key` declared here would be a field the fold *can* set — and eventually
// would. The idempotency key lives on `KeyedEffect` instead, which only the
// boundary and the replay harness may construct, and which is the only thing
// `perform` accepts. The wrong thing is unwritable rather than merely
// discouraged.

import type { Timestamp, ToolName } from "./ids";
import type { ToolResultBase } from "./tool-result";

/**
 * WHAT AN EFFECT COSTS IF IT HAPPENS TWICE, OR HAPPENS WRONGLY.
 *
 * `Routine` is a line in a log, a re-render, a delivery a reader can ignore.
 * `Irreversible` is the on-call page, the sealed artifact — the ones
 * docs/DECISIONS.md:85 says the boundary must refuse before `perform` rather
 * than apologise for afterwards.
 *
 * TOTAL, never a default. `EffectBase` declares the field, so every effect leaf
 * in the system answers — the same total-table idiom the Actor authority table
 * is built on, one seam over.
 */
export type EffectClass = "Routine" | "Irreversible";

export interface EffectBase {
  readonly kind: string;
  readonly at: Timestamp;
  /**
   * DECLARED PER LEAF, NOT SET PER INSTANCE. Every leaf below and in every block
   * contract narrows this to a LITERAL type (`"Routine"` or `"Irreversible"`),
   * so `{ kind: "PageOncall", …, effectClass: "Routine" }` is a compile error:
   * an arm cannot launder an irreversible effect into a routine one by writing a
   * different word. The class is a property of the KIND, and the compiler holds
   * it there.
   */
  readonly effectClass: EffectClass;
}

/** The spine's own effect: a diagnostic line. Never a domain action. */
export interface Diag extends EffectBase {
  readonly kind: "Diag";
  readonly effectClass: "Routine";
  readonly note: string;
}

export type SpineEffect = Diag;

export function diag(at: Timestamp, note: string): Diag {
  return { kind: "Diag", at, effectClass: "Routine", note };
}

// ── THE HANDLER SPLIT — effect performance, registrable per block ──────────
// The CASES stay sealed here, in the spine: a block appends to `Effect` through
// its own sub-union in its own contract, and nothing below changes that. What a
// block registers is a HANDLER — a function, not a type — so the closed set the
// compiler checks is untouched while the PERFORMANCE of a case moves into the
// folder that owns it. That split is the one the module graph depends on.
//
// `Handlers<E>` is a mapped type over the union's OWN discriminant, so it is
// derived, never re-spelled: a block's table is `Handlers<TriageEffect>` and
// stops compiling the moment `TriageEffect` grows a case the table does not
// answer. That error lands INSIDE the block folder. The composition root's
// `Handlers<Effect>` is satisfied by the block function's DECLARED return type,
// so the root stays green — which is what makes a novel effect kind cost ZERO
// PRODUCTION sites outside the owning folder, earned by the real compiler in
// test/gate/exhaustiveness.test.ts rather than asserted here.

export interface EffectHandler<E extends EffectBase> {
  (effect: E): void;
}

/** One handler per kind of `E`, keyed by the union's own discriminant. */
export type Handlers<E extends EffectBase> = {
  readonly [K in E["kind"]]: EffectHandler<Extract<E, { readonly kind: K }>>;
};

/** The one word the system uses for an effect nobody registered a handler for. */
export const ORPHAN_EFFECT = "no block registered a handler for effect kind";

/**
 * THE FLOOR UNDER EFFECT DISPATCH — `unclaimedArm`'s property at the perform seam.
 *
 * Not `unclaimedArm` itself, and the difference is structural rather than a
 * preference: `unclaimedArm` runs inside the pure fold, BEFORE the commit, which
 * is the only place a `Notice` can be folded. `perform` is boundary step 9 —
 * after the commit and after the state adoption — and returns `void`, so a
 * notice is unwritable here by construction. What survives is the half that
 * matters: TOTAL, and never silent. An orphaned kind is diagnosed through the
 * spine's own `Diag` effect, which the composition root already performs.
 *
 * The one cast this file owns. `Handlers<E>` is a mapped type, so indexing it
 * with a runtime `effect.kind` yields a union of handler types whose parameters
 * intersect to `never`; the erasure is the same trade `spine/pure/verb` makes
 * for its registry, confined to one expression in one file. It is also what
 * makes the undefined branch REACHABLE and therefore testable: the static table
 * cannot have a hole, a table thinned at runtime can.
 */
export function performEffect<E extends EffectBase>(
  handlers: Handlers<E>,
  effect: E,
  diagnose: EffectHandler<Diag>,
): void {
  const erased = handlers as unknown as Readonly<Record<string, EffectHandler<E> | undefined>>;
  const handler = erased[effect.kind];
  if (handler === undefined) {
    diagnose(diag(effect.at, `${ORPHAN_EFFECT} \`${effect.kind}\``));
    return;
  }
  handler(effect);
}

// ── ADMISSION — one pure rule, applied wherever effects are DERIVED ─────────
// docs/DECISIONS.md:85 puts the refusal at the boundary, "before perform".
// Written only there it would be a property of the LIVE path: a re-fold and a
// recovery re-drive derive their OWN effect sequence from the committed
// results, and a rule the live path applied and they do not is a rule that
// pages on-call again on restart. Measured against the first draft of this
// file: the boundary refused and the RECOVERY re-drive performed.
//
// So admission is a PURE RULE over committed data, and it is applied at every
// site that turns committed results into effects — boundary step 9, `refold`,
// and `refoldFrom`'s own inline loop (which does NOT call `refold`). Live ==
// REPLAY == RECOVERY by construction rather than by discipline.
//
// PER EFFECT, NOT PER STEP. A step is a list of results and its effects are one
// flat list; a licence granted to the STEP lets a Reversible verb's arm emit an
// irreversible effect for an unrelated ticket and ride out on the confirm
// standing beside it. So the fold ATTRIBUTES each effect to the result it came
// from, and the licence is checked against THAT result.
//
// SUBSTITUTE, NEVER DROP. A refused effect becomes a `Diag` AT ITS OWN
// POSITION, so the list length is preserved and `KeyedEffect`'s (step, index)
// key derivation is untouched (G9) — the refusal is visible at the key the
// effect would have had, instead of silently shifting every key after it.
//
// CALLER-THREADED AND UNREFUSED, said plainly: `Licences` is a parameter, not a
// seam that can refuse a mismatch the way `SnapshotTag` refuses a wrong reducer.
// `refold(initial, records, dispatchers, new Set())` type-checks and diverges
// from the live sink. docs/DECISIONS.md:85 asks for ONE RULE applied
// everywhere, not a refusing table; a refuse-on-mismatch seam for the table is
// a separate decision.

/** The names of the verbs registered `Irreversible`. Derived from the registry
 *  the boundary already holds, so there is no second table to keep in step. */
export type Licences = ReadonlySet<ToolName>;

export function licencesOf(
  verbs: Iterable<{ readonly kind: "Reversible" | "Irreversible"; readonly name: ToolName }>,
): Licences {
  const names = new Set<ToolName>();
  for (const verb of verbs) {
    if (verb.kind === "Irreversible") names.add(verb.name);
  }
  return names;
}

/** The one word the system uses for an irreversible effect nothing earned. */
export const REFUSED_EFFECT =
  "refused before perform — no surviving irreversible verb earned effect";

/**
 * ONE EFFECT AND THE COMMITTED RESULT IT CAME FROM — and the rule that judges
 * the pair, on the one type that holds both halves.
 *
 * The two halves are `#`-PRIVATE, so there is no `a.emitted` to write: the only
 * route from what the fold returned to what the sink performs is [Attributed.admit],
 * in every spelling a reader has, enforced by the language rather than by a
 * lint. That is the same move `Signature` makes one seam over, and it is why
 * check C16 is a TRIPWIRE here (it fires the instant a future author widens the
 * field back out) rather than the wall itself.
 *
 * THE RULE. A `Routine` effect always passes. An `Irreversible` effect passes
 * only when the result it came from is an `ok` result of a verb the registry
 * classified `Irreversible` — the same classification 14.3's default-deny is
 * built on, read from the same registry the gate read.
 *
 * `ok` is load-bearing, and it is the clause with its own probe: the gate's own
 * `Refused` verdict is a COMMITTED result, and an arm that emitted an
 * irreversible effect off the back of one would be performing exactly what the
 * gate denied. test/spine/admission.test.ts drives a gate-refused
 * `confirmEscalation` and watches this clause hold.
 */
export class Attributed {
  readonly #from: ToolResultBase;
  readonly #emitted: EffectBase;

  constructor(from: ToolResultBase, emitted: EffectBase) {
    this.#from = from;
    this.#emitted = emitted;
  }

  admit(licences: Licences): EffectBase {
    const effect = this.#emitted;
    if (effect.effectClass === "Routine") return effect;
    if (this.#earns(licences)) return effect;
    return diag(effect.at, `${REFUSED_EFFECT} \`${effect.kind}\` from \`${this.#from.tool}\``);
  }

  /** Did the result THIS effect came from earn an irreversible act? */
  #earns(licences: Licences): boolean {
    return this.#from.outcome === "ok" && licences.has(this.#from.tool);
  }
}

/** CONSTRUCTING an attribution is legal wherever the fold runs — the fold is
 *  the only place holding both halves. Only OPENING one is the rule's, and the
 *  rule is the only thing that can. */
export function attributed(from: ToolResultBase, emitted: EffectBase): Attributed {
  return new Attributed(from, emitted);
}

/** THE ONE CALL every effect-deriving site makes. PER EFFECT: the map is over
 *  attributions, so no result's licence can be spent on another result's
 *  effect. */
export function admit(licences: Licences, produced: readonly Attributed[]): readonly EffectBase[] {
  return produced.map((a) => a.admit(licences));
}
