// ── spine/boundary/boundary — THE ONE IMPURE SEAM (6.7, G9) ────────────────
// Clock, ids, bus, sink, authority, registry and the fold meet here and nowhere
// else. Nine ordered steps; three structural facts fall out of the order, and
// every implementation must preserve all three.
//
//  * COMMIT STRICTLY PRECEDES PERFORM — not by convention but because step 9
//    cannot run until step 7 has returned the StepIndex the key is built from.
//    14.6's ordering claim becomes unwritable-wrong.
//  * THE GATE RUNS BEFORE THE FOLD AND BEFORE THE COMMIT, so what is committed
//    is already the gate's verdict. A re-fold reproduces it without calling the
//    authorization seam again (G9).
//  * NOTHING DOWNSTREAM OF STEP 4 CAN LEARN WHO ACTED EXCEPT THROUGH `sig`. The
//    results were produced in step 3, before the signature existed. G1's
//    two-unreconciled-actor-values problem cannot recur, because there is only
//    one value and it is created after the tool has returned.

import type { Authorization } from "../ports/authorization";
import type { Bus } from "../ports/bus";
import type { Clock } from "../ports/clock";
import type { IdSource } from "../ports/id-source";
import type { Sink } from "../ports/sink";
import { Signature } from "../pure/actor";
import type { ContextBounds } from "../pure/context";
import { DEFAULT_CONTEXT_BOUNDS, render } from "../pure/context";
import type { Licences } from "../pure/effect";
import { admit, licencesOf } from "../pure/effect";
import type { SessionId, StepIndex } from "../pure/ids";
import { keyedEffect } from "../pure/keyed-effect";
import { SCHEMA_VERSION, type StepRecord } from "../pure/step-record";
import type { Ctx, Dispatchers } from "../pure/verb";
import type { FinishedStep, Registry } from "./action";
import { resolveAction, signResult } from "./action";
import { gate } from "./gate";

export interface BoundaryDeps<S> extends Dispatchers<S> {
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly bus: Bus;
  readonly sink: Sink;
  readonly authz: Authorization<S>;
  readonly registry: Registry<S>;
  readonly session: SessionId;
  /** an injected asset (7.3, 14.7), captured on every committed record */
  readonly promptVersion: string;
  /** THE REASONER'S GROWTH BOUND, wired at the root (docs/DECISIONS.md:174).
   *  Omit it and the spine's shipped defaults apply — the same shape the
   *  mailbox deadlines already ship (spine/concurrency/consumer). It lives HERE
   *  rather than baked into `projectContext` so that ONE value reaches both the
   *  digest this seam commits and the projection the tools read, and a replay
   *  can be re-derived under a different one. */
  readonly contextBounds?: ContextBounds;
}

export class Boundary<S> {
  private current: S;

  /** DERIVED FROM THE REGISTRY THE GATE ALREADY READ, so admission and the gate
   *  cannot disagree about which verbs are irreversible (docs/DECISIONS.md:85).
   *  The same value is published by the root and handed to the replay harness,
   *  which is what makes live == REPLAY == RECOVERY a property of the data
   *  rather than of two independently-maintained tables. */
  private readonly licences: Licences;

  /** RESOLVED ONCE, for the reason `licences` is: a value re-defaulted per call
   *  is a value two call sites can disagree about, and the whole point of
   *  docs/DECISIONS.md:174 is that the bound the model saw and the bound the
   *  digest was derived under are one fact. */
  private readonly bounds: ContextBounds;

  constructor(
    private readonly deps: BoundaryDeps<S>,
    initial: S,
  ) {
    this.current = initial;
    this.licences = licencesOf(deps.registry.values());
    this.bounds = deps.contextBounds ?? DEFAULT_CONTEXT_BOUNDS;
  }

  get state(): S {
    return this.current;
  }

  /** The wired bound, published so the agent loop and a replay site READ it
   *  instead of re-defaulting their own copy. */
  get contextBounds(): ContextBounds {
    return this.bounds;
  }

  onStepFinish(step: FinishedStep): StepIndex {
    // 1  the ONLY clock read in the system (G9)
    const now = this.deps.clock.now();

    // 2  the THIRD pure projection (G15) — the same Context the reasoner saw
    const ctx: Ctx<S> = {
      state: this.current,
      context: this.deps.projectContext(this.current, step.staged, this.bounds),
    };

    // 3  the ONE closed name→ToolResult map (G1)
    const results = step.actions.map((action) => resolveAction(this.deps.registry, action, ctx));

    // 4  stamp AND resolve authority (G1 + G6) — one value, created here, ever
    const sig = new Signature(step.by, this.deps.authz.authorityOf(step.by, this.deps.session));

    // 5  PRE-FOLD gate (G1/G6)
    const gated = results.map((r) =>
      gate(r, sig, this.current, this.deps.registry, this.deps.authz),
    );

    // 6  the pure decision — the only decider in the system
    const folded = this.deps.fold(this.current, gated, now, sig);

    // 7  COMMIT (14.6) — the step is the unit, and `now` rides it (G9).
    //    6.8: EVERY verb signs, presentation and domain alike.
    //    14.7: the envelope is stamped HERE, at the one site that mints a
    //    record, so no committed step can be missing its version.
    const record: StepRecord = {
      schemaVersion: SCHEMA_VERSION,
      now,
      sig,
      staged: step.staged,
      actions: step.actions,
      results: gated,
      commands: gated.map((r) => signResult(this.deps.registry, r, sig, this.deps.ids.next())),
      context: { promptVersion: this.deps.promptVersion, digest: render(ctx.context) },
    };
    const index = this.deps.bus.append(record);

    // 8  adopt the derived cache
    this.current = folded.state;

    // 9  ADMIT, then key from the COMMITTED index (G9) — the index is
    //    unavailable until step 7 returned, and the list handed to `perform` is
    //    FLAT: admission SUBSTITUTES a diagnostic in place rather than dropping,
    //    so the (step, index) key derivation is untouched.
    admit(this.licences, folded.effects).forEach((effect, i) => {
      this.deps.sink.perform(keyedEffect(index, i, effect), "LIVE");
    });

    return index;
  }
}
