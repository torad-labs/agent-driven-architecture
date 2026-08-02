// ── blocks/artifact/port — the block's PRIVATE frozen contract ─────────────
// An interface, nothing else (check C11).

import type { ArtifactLine } from "./slice";

export interface DeliveryPort {
  deliver(lines: readonly ArtifactLine[]): void;
}
