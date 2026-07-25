// ── spine/ports/bus — the append-only timeline (F8/D6) ─────────────────────
// append() takes a whole StepRecord and returns the offset it landed at. The
// returned StepIndex is the ORIGIN of every effect key in that step, which is what
// makes "commit strictly precedes perform" a fact about the code rather than a
// convention about the order two lines happen to be written in.

package adr.spine.ports

import adr.spine.pure.StepIndex
import adr.spine.pure.StepRecord

interface Bus {
    fun append(record: StepRecord): StepIndex

    fun records(): List<StepRecord>
}
