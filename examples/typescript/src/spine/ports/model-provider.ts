// ── spine/ports/model-provider — the cognition seam ─────────────────────────
// INTERFACES ONLY (C11). The reasoner is a dependency like any other: the spine
// publishes the contract, `app/wire` binds a real or a scripted one, and
// `spine/agent/loop` is the single adapter that knows the runtime's shape.

import type { Context } from "../pure/context";

export interface TurnRequest {
  readonly prompt: string;
  readonly context: Context;
}

/** WHAT A TURN COST AND HOW IT ENDED. Structural, and deliberately NOT the SDK's
 *  own type: C11 keeps this file interfaces-only and the confinement that lets
 *  exactly one spine module name the runtime is a LOCKED decision, not something
 *  this widening reopens. What was wrong was never that the seam existed — it was
 *  that the seam was TWO FIELDS WIDE and threw the rest away.
 *
 *  `usage` is the WHOLE TURN, not the last step. That distinction is the
 *  documented undercounting trap for multi-step calls, and a seam that reported
 *  the final step would silently under-bill every turn that used a tool. */
export interface TurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface TurnOutcome {
  readonly steps: number;
  readonly text: string;
  /** why generation stopped — `stop`, `tool-calls`, `length`, … `length` means
   *  the output was TRUNCATED, which a caller that only reads `text` cannot
   *  tell apart from a complete answer. */
  readonly finishReason: string;
  readonly usage: TurnUsage;
  /** provider warnings — an unsupported setting is reported here rather than
   *  thrown, so a seam that drops them drops the only notice a deployment gets. */
  readonly warnings: readonly string[];
}

export interface ModelProvider {
  runTurn(request: TurnRequest): Promise<TurnOutcome>;
}
