// ── spine/ports/sink — the perform seam (G9) ───────────────────────────────
// perform accepts a KeyedEffect and NOTHING ELSE. The key is the idempotency key
// 14.6 depends on, and it is derived from the committed step index, so the fold
// cannot mint it and a caller cannot forget it.

package adr.spine.ports

import adr.spine.pure.KeyedEffect
import adr.spine.pure.PerformMode

interface Sink {
    fun perform(keyed: KeyedEffect, mode: PerformMode)
}
