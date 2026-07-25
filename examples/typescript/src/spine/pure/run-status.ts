// ── spine/pure/run-status — SESSION-GLOBAL, boundary-only (F9) ──────────────
// A closed set describing the SESSION, not an item. `Degraded` and `Error` may
// be constructed only inside `spine/boundary/**` — a budget exceeded, an append
// that failed, a turn that threw. Gate check C6 denies both constructors under
// `blocks/**`, so the F9 bug (a per-item rejection hijacking the session
// banner) cannot be written again.

export type RunStatusKind = "Idle" | "Working" | "Degraded" | "Error";

export interface RunStatusBase {
  readonly kind: RunStatusKind;
}

export interface Idle extends RunStatusBase {
  readonly kind: "Idle";
}
export interface Working extends RunStatusBase {
  readonly kind: "Working";
  readonly step: number;
}
export interface Degraded extends RunStatusBase {
  readonly kind: "Degraded";
  readonly cause: string;
}
export interface Errored extends RunStatusBase {
  readonly kind: "Error";
  readonly fault: string;
}

export type RunStatus = Idle | Working | Degraded | Errored;

export const idle: Idle = { kind: "Idle" };

export function working(step: number): Working {
  return { kind: "Working", step };
}

/** boundary-only (check C6) */
export function degraded(cause: string): Degraded {
  return { kind: "Degraded", cause };
}

/** boundary-only (check C6) */
export function errored(fault: string): Errored {
  return { kind: "Error", fault };
}
