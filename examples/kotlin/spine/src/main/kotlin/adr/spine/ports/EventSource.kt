// ── spine/ports/event-source — the sensing seam ────────────────────────────
// Raw, UNTRUSTED perceived content arriving from the world (10.2). Whatever it
// yields is staged for exactly one turn, captured on that turn's StepRecord, and
// projected into the reasoner's Context — never accumulated.
//
// It yields the NARROW variant. A `Recalled` snapshot has exactly one production
// site in the system — the barge-in consumer, which is the party that bounded the
// read — so no sensing adapter can forge a peer tier's conclusion.

package adr.spine.ports

import adr.spine.pure.StagedInput

interface EventSource {
    fun poll(): StagedInput.Perceived?
}
