// ── blocks/analysis/port — the relay's WRITE half (11.2) ─────────────────────
// An interface, nothing else (check C11). The block owns its dependency; the
// composition root binds it, exactly like `OncallPort` and `DeliveryPort`.
//
// The relay is SPLIT BY DIRECTION, and the split is the architecture's own line:
// the READ side is `spine/ports/relay` because the consumer must bound it and
// the `Recall` it produces is spine transport that rides `StepRecord`; the WRITE
// side is a feature's backend seam and lives here. `app/wire` binds both halves
// to one store, because the root is the only cross-layer importer — which is how
// the two tiers meet without the spine ever naming a block.

import type { Timestamp } from "@adr/spine/pure/ids";

export interface AnalysisRelay {
  publish(at: Timestamp, text: string): void;
}
