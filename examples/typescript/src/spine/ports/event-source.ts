// ── spine/ports/event-source — the sensing seam (raw events in) ─────────────
// INTERFACES ONLY (C11). Perceived content is UNTRUSTED (10.2) and off-bus, so
// it arrives as a `Perceived` that the boundary captures on the committed record
// as one entry of that step's ordered staged fixture (5.4).
//
// The return type is NARROWED to `Perceived`, not `StagedInput`: a sensor cannot
// hand the system a `Recalled`, because a peer tier's conclusion has exactly one
// production site in the system and it is the consumer's bounded relay read.

import type { Perceived } from "../pure/staged";

export interface EventSource {
  poll(): Perceived | null;
}
