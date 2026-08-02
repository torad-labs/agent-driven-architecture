// ── spine/ports/id-source — the identity seam ──────────────────────────────
// Ids are minted at the boundary, never chosen by a model and never derived inside
// the fold (G9).

package adr.spine.ports

import adr.spine.pure.CommandId

interface IdSource {
    fun next(): CommandId
}
