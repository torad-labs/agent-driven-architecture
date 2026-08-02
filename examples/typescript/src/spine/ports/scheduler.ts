// ── spine/ports/scheduler — elapsed time is a PORT (G9, 12.3) ──────────────
// INTERFACES ONLY (C11). TypeScript-only: Kotlin's test dispatcher virtualises
// `delay` for free, so its consumer calls `withTimeoutOrNull` directly. This is
// one of exactly two files where the two reference ports differ, and both
// differences are language-forced.
//
// Every bound in the consumer — the cancel deadline, the drain deadline, the
// recall deadline — is a RELATIVE DURATION handed to this port. The consumer
// therefore never reads a wall clock (C3 applies to it in full), and
// `clock.now()` at the boundary stays the only clock read in the system.
//
// `signal` is not a convenience. A bound that has already been decided must be
// cancellable, or every abandoned race leaves a live timer holding the process
// open — which is a leak the tests would not see and a deployment would.

export type Elapsed = "elapsed" | "aborted";

export interface Scheduler {
  after(ms: number, signal: AbortSignal): Promise<Elapsed>;
}
