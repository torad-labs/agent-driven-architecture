// BLOCK-TEST C6 (12.4) — a per-item failure reaches the SESSION status.
// Measured: "confirm on a ticket absent from State -> PageOncall fired AND run ->
// Degraded", and the banner then read "degraded: ..." for the rest of the session.
// One bad ticket, one poisoned session. The fix is not to remember to clear a
// flag; it is that a block cannot reach RunStatus at all.
package adr.blocks.escalation

import adr.spine.pure.RunStatus
import adr.spine.pure.Timestamp

fun rejectLoudly(now: Timestamp, ticket: String): RunStatus =
    RunStatus.Degraded("unknown ticket $ticket at ${now.value}")
