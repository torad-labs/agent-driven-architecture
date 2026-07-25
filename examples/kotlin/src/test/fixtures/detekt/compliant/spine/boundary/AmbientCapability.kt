// ── ALLOW-TEST for gate check C3 (G9) ─────────────────────────────────────
// The SAME calls as the violating fixture, in the one folder the architecture says
// they belong. spine/boundary is where an ambient capability is adapted into a
// port, so that everything upstream is HANDED a value instead of reading the world.
//
// This is what keeps C3 from being a nuisance: the rule does not ban the clock, it
// bans reading it anywhere but here. An author who follows the architecture never
// meets this rule at all — and an author who does meet it has been told exactly
// which file to move the call into.
//
// EXPECTED: no findings.

package fixture.compliant.spine.boundary

import java.time.Instant
import java.util.UUID
import kotlin.random.Random

fun interface Clock {
    fun now(): Long
}

fun interface IdSource {
    fun next(): String
}

fun interface Jitter {
    fun sample(): Int
}

val systemClock = Clock { System.currentTimeMillis() }

val instantClock = Clock { Instant.now().toEpochMilli() }

val randomIds = IdSource { UUID.randomUUID().toString() }

val randomJitter = Jitter { Random.nextInt(100) }
