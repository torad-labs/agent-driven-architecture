// ── spine/boundary/in-memory — the deterministic adapters ──────────────────
// Everything that would otherwise be ambient — the clock, the id source, the log,
// the effect tap — lives here, behind the ports, so the whole system can be driven
// offline and re-driven identically.

package adr.spine.boundary

import adr.contract.Effect
import adr.spine.ports.Bus
import adr.spine.ports.Clock
import adr.spine.ports.IdSource
import adr.spine.ports.Sink
import adr.spine.pure.CommandId
import adr.spine.pure.EffectKey
import adr.spine.pure.KeyedEffect
import adr.spine.pure.PerformMode
import adr.spine.pure.StepIndex
import adr.spine.pure.StepRecord
import adr.spine.pure.Timestamp

/** The append-only timeline. append() returns the offset — the origin of every effect key. */
class InMemoryBus : Bus {
    private val recorded = mutableListOf<StepRecord>()

    override fun append(record: StepRecord): StepIndex {
        val index = StepIndex(recorded.size)
        recorded += record
        return index
    }

    override fun records(): List<StepRecord> = recorded.toList()
}

/** A clock that advances by `step` on every read. First read returns start + step. */
class MovingClock(start: Long, private val step: Long) : Clock {
    private var t = start

    override fun now(): Timestamp {
        t += step
        return Timestamp(t)
    }
}

/** Mints c1, c2, c3… — the deterministic stand-in for the boundary's id seam. */
class SequentialIds(private val prefix: String = "c") : IdSource {
    private var n = 0

    override fun next(): CommandId = CommandId("$prefix${++n}")
}

/**
 * The audit tap: records every KeyedEffect that crossed the seam, then forwards it.
 * Keys and timestamps are both recorded, so a golden effect sequence compares them.
 */
class RecordingSink(private val downstream: Sink? = null) : Sink {
    val performed = mutableListOf<KeyedEffect>()

    override fun perform(keyed: KeyedEffect, mode: PerformMode) {
        performed += keyed
        downstream?.perform(keyed, mode)
    }
}

/**
 * The recovery-path sink (14.6): the same KeyedEffect delivered twice fires ONCE,
 * because the key was derived from the committed step index and is therefore stable
 * across a crash and a restart.
 */
class DedupingSink(private val downstream: Sink? = null) : Sink {
    private val seen = mutableSetOf<EffectKey>()
    val fired = mutableListOf<Effect>()

    override fun perform(keyed: KeyedEffect, mode: PerformMode) {
        if (!seen.add(keyed.key)) return
        fired += keyed.effect
        downstream?.perform(keyed, mode)
    }
}
