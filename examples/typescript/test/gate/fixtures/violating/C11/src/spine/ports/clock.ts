// VIOLATION: 7.9/G13 — a port is a published contract, not an implementation.
export function systemClock(): { now: () => number } {
  return { now: () => 0 };
}
