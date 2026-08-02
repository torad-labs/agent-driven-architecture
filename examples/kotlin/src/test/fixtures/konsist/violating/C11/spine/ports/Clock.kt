// BLOCK-TEST C11 (7.9/G13) — a port with an implementation in it.
// The moment a port folder holds a body, "a port is a published contract, not an
// implementation" stops being a property of the folder and becomes a convention
// somebody has to remember. Every consumer of this file now depends on a
// behaviour, and the root loses its monopoly on knowing what is real in a build.
package adr.spine.ports

import adr.spine.pure.Timestamp

interface Clock {
    fun now(): Timestamp
}

class SystemClock : Clock {
    override fun now(): Timestamp = Timestamp(0)
}

fun defaultClock(): Clock = SystemClock()
