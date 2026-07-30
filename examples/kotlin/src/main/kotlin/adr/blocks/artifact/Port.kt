// ── blocks/artifact/port — the block's PRIVATE frozen contract ─────────────

package adr.blocks.artifact

import adr.contract.ArtifactResult.ArtifactLine

interface DeliveryPort {
    fun deliver(lines: List<ArtifactLine>)
}
