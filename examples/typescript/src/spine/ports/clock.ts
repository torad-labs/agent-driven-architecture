// ── spine/ports/clock — the only source of `now` (G9) ───────────────────────
// INTERFACES ONLY. A file in this folder with a body is a gate failure (C11).
// "A port is a published contract, not an implementation" (7.9/G13) is a
// property of the FOLDER here, not a convention someone remembers.

import type { Timestamp } from "../pure/ids";

export interface Clock {
  now(): Timestamp;
}
