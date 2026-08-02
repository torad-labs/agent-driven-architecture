// ── spine/ports/model-provider — the cognition seam ─────────────────────────
// INTERFACES ONLY (C11). The reasoner is a dependency like any other: the spine
// publishes the contract, `app/wire` binds a real or a scripted one, and
// `spine/agent/loop` is the single adapter that knows the runtime's shape.

import type { Context } from "../pure/context";

export interface TurnRequest {
  readonly prompt: string;
  readonly context: Context;
}

export interface TurnOutcome {
  readonly steps: number;
  readonly text: string;
}

export interface ModelProvider {
  runTurn(request: TurnRequest): Promise<TurnOutcome>;
}
