// ── blocks/artifact/port — the block's PRIVATE frozen contract ─────────────

package adr.blocks.artifact

interface DeliveryPort {
    fun deliver(lines: List<ArtifactLine>)
}
