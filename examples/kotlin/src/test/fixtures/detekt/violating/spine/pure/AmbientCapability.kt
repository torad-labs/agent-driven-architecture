// ── BLOCK-TEST for gate check C3 (G9) ─────────────────────────────────────
// A pure-ring file that reads the clock, rolls dice and mints an id out of thin
// air. This is the shape the review measured (15.2) shipping green: Date.now() inside a tool
// passed a clean build in BOTH reference ports.
//
// It sits under spine/pure/, NOT under spine/boundary/, which is the whole point:
// the same calls are legal one folder over (see the ALLOW-test fixture) and
// illegal here. A fold that reads the world cannot be re-folded, so this is not a
// style preference — it is what makes replay mean anything.
//
// EXPECTED: detekt.ForbiddenMethodCall fires on every call below.

package fixture.violating.spine.pure

import java.time.Instant
import java.util.UUID
import kotlin.random.Random

data class Stamped(val at: Long, val instant: String, val id: String, val jitter: Int)

fun stampNow(note: String): Stamped = Stamped(
    at = System.currentTimeMillis(),
    instant = Instant.now().toString(),
    id = UUID.randomUUID().toString() + note,
    jitter = Random.nextInt(100),
)
