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
//    results were produced in step 3, before the signature existed. F2's
//    two-unreconciled-actor-values problem cannot recur, because there is only
//    one value and it is created after the tool has returned.

import type { Authorization } from "../ports/authorization";
import type { Bus } from "../ports/bus";
import type { Clock } from "../ports/clock";
import type { IdSource } from "../ports/id-source";
import type { Sink } from "../ports/sink";
import type { Signature } from "../pure/actor";
import { render } from "../pure/context";
import type { SessionId, StepIndex } from "../pure/ids";
import { keyedEffect } from "../pure/keyed-effect";
import type { StepRecord } from "../pure/step-record";
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
}

export class Boundary<S> {
  private current: S;

  constructor(
    private readonly deps: BoundaryDeps<S>,
    initial: S,
  ) {
    this.current = initial;
  }

  get state(): S {
    return this.current;
  }

  onStepFinish(step: FinishedStep): StepIndex {
    // 1  the ONLY clock read in the system (G9)
    const now = this.deps.clock.now();

    // 2  the THIRD pure projection (F4/G15) — the same Context the reasoner saw
    const ctx: Ctx<S> = {
      state: this.current,
      context: this.deps.projectContext(this.current, step.staged),
    };

    // 3  the ONE closed name→ToolResult map (F1)
    const results = step.actions.map((action) => resolveAction(this.deps.registry, action, ctx));

    // 4  stamp AND resolve authority (G1 + F3) — one value, created here, ever
    const sig: Signature = {
      by: step.by,
      authority: this.deps.authz.authorityOf(step.by, this.deps.session),
    };

    // 5  PRE-FOLD gate (F2/F3/F13)
    const gated = results.map((r) =>
      gate(r, sig, this.current, this.deps.registry, this.deps.authz),
    );

    // 6  the pure decision — the only decider in the system
    const folded = this.deps.fold(this.current, gated, now, sig);

    // 7  COMMIT (14.6) — the step is the unit, and `now` rides it (F8).
    //    A1: EVERY verb signs, presentation and domain alike.
    const record: StepRecord = {
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

    // 9  key from the COMMITTED index (F7) — unavailable until step 7 returned
    folded.effects.forEach((effect, i) => {
      this.deps.sink.perform(keyedEffect(index, i, effect), "LIVE");
    });

    return index;
  }
}
