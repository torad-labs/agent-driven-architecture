// ── spine/pure/tool-result — the sealed ROOT of the fold's input (L3, F1) ───
// The payload a verb returns; the ONLY thing the fold consumes. Kotlin gets a
// `sealed interface ToolResult { val tool: ToolName }`. TypeScript has no
// sealed classes, so L3 is expressed natively as:
//
//   a SHARED BASE INTERFACE (`ToolResultBase`) declaring the common fields ONCE
//   + a discriminated union closed at `app/contract`
//   + a `never`-guarded exhaustive match at EVERY consumer.
//
// Two discriminants, both on the base and both load-bearing:
//   `outcome` — the TS stand-in for Kotlin's sealed-subclass dispatch. It is
//               what lets a consumer separate the spine's own two cases from a
//               block's, since a spine case carries someone ELSE's tool name.
//   `tool`    — D3: the verb name. The same string is the registry key, the
//               Command's name and the Notice's key. "The gate keys off names"
//               (17.6) is literally true here.
//
// HARD CONSTRAINT (F2 / D4): no variant of this hierarchy has a field of type
// Actor, Authority or Signature, and none may gain one. Enforced by check C4.

import type { ToolName } from "./ids";

export type ResultOutcome = "ok" | "unhandled" | "refused";

/** The shared base — every ToolResult in the system carries these two fields. */
export interface ToolResultBase {
  readonly outcome: ResultOutcome;
  readonly tool: ToolName;
}

/** An Action naming no registered verb, or an input that failed to decode. */
export interface Unhandled extends ToolResultBase {
  readonly outcome: "unhandled";
  readonly note: string;
}

/** The boundary gate said no. COMMITTED, so it re-folds without re-checking (D5). */
export interface Refused extends ToolResultBase {
  readonly outcome: "refused";
  readonly reason: string;
}

/** The spine's own two cases. Every other case is contributed by a block. */
export type SpineResult = Unhandled | Refused;

export function unhandled(tool: ToolName, note: string): Unhandled {
  return { outcome: "unhandled", tool, note };
}

export function refused(tool: ToolName, reason: string): Refused {
  return { outcome: "refused", tool, reason };
}

/** Narrow a base-typed result to the spine's two cases. */
export function isSpineResult(r: ToolResultBase): r is SpineResult {
  return r.outcome !== "ok";
}
