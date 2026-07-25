// ── blocks/artifact/adapter — the ONLY file in this block that may hold a client ─

package adr.blocks.artifact

import adr.spine.pure.Emit

/**
 * The rim of the block. `write` stands in for the document store / mailer — a real
 * one would be a client handle held here and nowhere else.
 */
class LiveDelivery(private val write: Emit<String>) : DeliveryPort {
    override fun deliver(lines: List<ArtifactLine>) {
        write(lines.joinToString("\n") { "[${it.at.value}] ${it.by}: ${it.text}" })
    }
}
