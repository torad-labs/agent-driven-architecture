// ── fixture: the STAND-IN COMPOSITION ROOT, POST-split ───
// This file is what makes the block-test's "and nowhere else" guard able to FAIL.
//
// A fixture directory holding ONE .kt file cannot produce a second filename in the
// compiler log, so the guard's `elsewhere` set was empty by construction — a wall
// that cannot fire, which is the one thing a wall may never be. With this file
// present the set is a real measurement.
//
// It is written in the POST-split idiom on purpose: it LISTS a performer and names no
// effect kind, so appending a kind to DemoEffect above leaves it untouched. Rewrite it
// in the PRE-split idiom — an exhaustive `when` over DemoEffect with no else arm — and
// `gateEffectKindBlockTest` goes red with "the compiler also named [Root.kt]". That is
// the reversal the pair keeps as a measured fact, red-proven rather than asserted.

package adr.fixture.effectkind

import adr.spine.pure.Emit

/** One block's contribution to the perform seam, as this fixture can spell it. The
 *  real seam is `adr.spine.pure.PerformEffect<E : Effect>`, which a locally declared
 *  union cannot satisfy — same shape, one module over. */
fun interface PerformDemo {
    operator fun invoke(effect: DemoEffect)
}

class DemoRoot(emit: Emit<String>) {

    private val block = DemoBlock(emit)

    /** Assembly, not branching: the root holds performers and names no kind. */
    fun performers(): List<PerformDemo> = listOf(PerformDemo { block.perform(it) })
}
