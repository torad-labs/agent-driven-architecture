// ── test/gate — the gate, and the proof that it DENIES ────────────────────
// Every structural check gets three assertions, on every build:
//
//   LIVE  — it passes on the tree it defends;
//   BLOCK — it REJECTS a deliberately violating fixture;
//   ALLOW — it ACCEPTS the same shape written the way the architecture asks.
//
// The BLOCK half is the red-green proof, executed rather than remembered: delete a
// rule's body and its own test fails immediately, because a check that cannot fail
// is what F12 measured shipping. The ALLOW half is 15.2's discipline — a rule
// without one drifts into a nuisance authors turn off, and then the gate is
// decorative again.
//
// The three type-aware checks (C3, C9, C14) get the identical treatment one level
// up, in build.gradle.kts: gateDetektBlockTest asserts each one fired on the
// violating fixtures, gateDetektAllowTest asserts none fired on the compliant ones.

package adr.gate

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GateTest {

    private val live = GateTrees().liveTree()

    private fun verify(id: String) {
        val check = CHECKS.single { it.id == id }

        assertEquals(
            emptyList(),
            check.run(live).map { "${it.path} — ${it.message}" },
            "${check.id} (${check.title}) must pass on the live tree",
        )

        val blocked = check.run(GateTrees().fixtureTree("violating", id))
        assertTrue(
            blocked.isNotEmpty(),
            "${check.id} BLOCK-TEST: the violating fixture was ACCEPTED. " +
                "A check nobody has watched fail is not a check.",
        )

        assertEquals(
            emptyList(),
            check.run(GateTrees().fixtureTree("compliant", id)).map { "${it.path} — ${it.message}" },
            "${check.id} ALLOW-TEST: idiomatic compliant code was rejected (15.2)",
        )
    }

    @Test fun `C1 - dependencies point inward`() = verify("C1")

    @Test fun `C2 - no cross-block symbol import`() = verify("C2")

    @Test fun `C4 - an Actor is unrepresentable upstream of the boundary`() = verify("C4")

    @Test fun `C5 - the fold cannot key an effect`() = verify("C5")

    @Test fun `C6 - a per-item failure is never session-global`() = verify("C6")

    @Test fun `C7 - one production site for ToolResult`() = verify("C7")

    @Test fun `C8 - the pure ring performs no IO`() = verify("C8")

    @Test fun `C10 - no top-level mutable state outside the boundary`() = verify("C10")

    @Test fun `C11 - ports are interfaces only`() = verify("C11")

    @Test fun `C12 - ephemeral view-state never folds`() = verify("C12")

    @Test fun `C15 - the spine tier is self-contained and vendorable`() = verify("C15")

    /**
     * The roster. Fifteen checks, three homes, and every one of them denying.
     *
     * This test exists so the count cannot quietly drop: deleting a rule deletes a
     * row here too, which is a diff a reviewer sees. 15.3's "roughly four dozen
     * checks" is not the claim being made — the reference ships fifteen, and the
     * point is the denial, not the count.
     */
    @Test
    fun `F12 - all fifteen checks ship, and each one is enforced somewhere`() {
        val roster = mapOf(
            "C1" to "konsist", "C2" to "konsist", "C3" to "detekt",
            "C4" to "konsist+detekt", "C5" to "konsist", "C6" to "konsist+detekt",
            "C7" to "konsist+detekt", "C8" to "konsist", "C9" to "detekt",
            "C10" to "konsist", "C11" to "konsist", "C12" to "konsist",
            "C13" to "junit-reflection", "C14" to "detekt", "C15" to "konsist",
        )
        assertEquals(15, roster.size)

        // Every check the roster says Konsist owns is really implemented here…
        val konsistOwned = roster.filterValues { it.contains("konsist") }.keys
        assertEquals(konsistOwned, CHECKS.map { it.id }.toSet())

        // …and every one of them ships BOTH fixtures, or `verify` above could not
        // have proven anything about it.
        CHECKS.forEach { check ->
            assertTrue(
                GateTrees().fixtureTree("violating", check.id).isNotEmpty(),
                "${check.id} has no violating fixture",
            )
            assertTrue(
                GateTrees().fixtureTree("compliant", check.id).isNotEmpty(),
                "${check.id} has no compliant fixture",
            )
        }
    }

    /**
     * F10/§11.2: the edit list for a new state variant is K = 3, and every one of
     * the three is INSIDE the owning block.
     *
     * The compiler proves the "breaks the build at three sites" half — see
     * gateExhaustiveBlockTest in build.gradle.kts, which compiles a five-variant
     * copy of these three consumers and demands a non-zero exit naming all three.
     * What that cannot see is the OTHER half of the claim: that no sibling and no
     * spine file names TicketStatus at all, so the compiler's edit list IS the
     * block's own consumers and there is nothing outside it to go and find.
     */
    @Test
    fun `F10 - a new TicketStatus variant has ZERO consumers outside its own block`() {
        val outside = live
            .filter { it.block != "escalation" && GateTrees().mentions(it.codeText, "TicketStatus") }
            .map { it.path }
        assertEquals(emptyList(), outside, "§11.2 claims K = 3, all inside blocks/escalation/")

        // The variant is DECLARED in exactly one file — the append §11.2 counts as
        // the site you write yourself…
        val declaring = live.filter { it.block == "escalation" && it.codeText.contains("sealed interface TicketStatus") }
        assertEquals(listOf("blocks/escalation/Slice.kt"), declaring.map { it.path })

        // …and MATCHED in exactly two, carrying three closed matches between them:
        // the fold arm's transition, the view's row, and contextLines' status. If a
        // consumer moves out of the block, the first assertion catches it; if one
        // moves within it, this one does.
        val consumers = live
            .filter { it.block == "escalation" && it.codeText.contains("is TicketStatus.Open") }
            .map { it.path }
            .toSet()
        assertEquals(setOf("blocks/escalation/Fold.kt", "blocks/escalation/Project.kt"), consumers)
    }

    /**
     * L5/A1: a new verb touches FOUR appends, three files, one folder — and the
     * same four whether it is a domain verb or a presentation verb.
     *
     * 6.8's carve-out ("a UI tool folds, does not sign") is what A1 deletes, and
     * this is the assertion that keeps it deleted: the presentation block has the
     * same file set and declares its verbs with the same constructors as a domain
     * block. There is no cheaper UI path, because there is no UI path.
     */
    @Test
    fun `L5 - a new verb touches FOUR appends, three files, one folder - uniformly (A1)`() {
        val perBlock = live.mapNotNull { f -> f.block?.let { it to f } }.groupBy({ it.first }, { it.second })
        listOf("triage", "escalation", "console", "artifact", "analysis", "inbox").forEach { block ->
            val names = perBlock.getValue(block).map { it.fileName }.toSet()
            assertTrue(
                names.containsAll(
                    setOf("Contract.kt", "Slice.kt", "Tools.kt", "Fold.kt", "Project.kt", "Register.kt"),
                ),
                "$block is missing one of the six block files: $names",
            )
        }

        val console = live.single { it.path == "blocks/console/Tools.kt" }
        val triage = live.single { it.path == "blocks/triage/Tools.kt" }
        assertTrue(console.codeText.contains("Verb.Reversible(") && triage.codeText.contains("Verb.Reversible("))
        assertTrue(console.codeText.contains("sign ="), "a presentation verb SIGNS, exactly like a domain verb")
    }
}
