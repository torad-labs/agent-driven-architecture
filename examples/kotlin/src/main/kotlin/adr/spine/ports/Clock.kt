// ── spine/ports/clock — the time seam ──────────────────────────────────────
// A file in spine/ports/ with a body is a gate failure (check C11). A port is a
// published contract, not an implementation (7.9/G13) — here that is a property of
// the FOLDER, not a convention.

package adr.spine.ports

import adr.spine.pure.Timestamp

/** Read exactly once per step, by the boundary, and committed on the StepRecord (G9/F8). */
interface Clock {
    fun now(): Timestamp
}
