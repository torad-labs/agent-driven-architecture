// ── blocks/analysis/adapter — the ONLY file in this block that may hold a store ─
// L4 in one file name (I8): if you want to know what this block can touch in the
// world, this is the only place to look. It is bound at the single composition
// root, where `wireApp` hands it the relay the other tier reads from.

package adr.blocks.analysis

import adr.spine.pure.Timestamp

/**
 * The rim of the block. `append` stands in for the relay store — a real one would be
 * a Kafka producer, an outbox table or an S3 prefix, held here and nowhere else.
 */
/** The relay's write seam, named rather than a raw `(Timestamp, String) -> Unit`. */
fun interface AppendConclusion {
    operator fun invoke(at: Timestamp, text: String)
}

class LiveRelayWriter(private val append: AppendConclusion) : AnalysisRelay {
    override fun publish(at: Timestamp, text: String) {
        append(at, text)
    }
}
