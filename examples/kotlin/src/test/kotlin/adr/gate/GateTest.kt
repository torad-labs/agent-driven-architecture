// ── test/gate — the gate, and the proof that it DENIES ────────────────────
// Every structural check gets three assertions, on every build:
//
//   LIVE  — it passes on the tree it defends;
//   BLOCK — it REJECTS a deliberately violating fixture;
//   ALLOW — it ACCEPTS the same shape written the way the architecture asks.
//
// The BLOCK half is the red-green proof, executed rather than remembered: delete a
// rule's body and its own test fails immediately, because a check that cannot fail
// is what the review measured (15.2) shipping. The ALLOW half is 15.2's discipline — a rule
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
    fun `THE ROSTER - all fifteen checks ship, and each one is enforced somewhere`() {
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
     * This port's own arithmetic, PINNED — the same move as the fifteen-check
     * roster above. A counted claim that nothing measures is how "35 files" ships
     * while the tree holds 37, so the count lives HERE, where a spine file added
     * or removed is a diff. This port's README quotes the number; the README text
     * is not itself measured, so a README that disagrees with this pin is a
     * review catch, not a build catch. (The TS port pins its own roster of 36 —
     * one extra ports file there, three pure files here; same components, spelled
     * per language.)
     */
    @Test
    fun `the spine roster is pinned - exactly these 37 files`() {
        val spine = live.map { it.path }.filter { it.startsWith("spine/") }.sorted()
        assertEquals(
            listOf(
                "spine/agent/Loop.kt",
                "spine/boundary/Action.kt",
                "spine/boundary/Boundary.kt",
                "spine/boundary/Gate.kt",
                "spine/boundary/InMemory.kt",
                "spine/concurrency/Consumer.kt",
                "spine/concurrency/InMemory.kt",
                "spine/ports/Authorization.kt",
                "spine/ports/Bus.kt",
                "spine/ports/Clock.kt",
                "spine/ports/EventSource.kt",
                "spine/ports/IdSource.kt",
                "spine/ports/Mailbox.kt",
                "spine/ports/ModelProvider.kt",
                "spine/ports/Relay.kt",
                "spine/ports/Sink.kt",
                "spine/pure/Action.kt",
                "spine/pure/Actor.kt",
                "spine/pure/Block.kt",
                "spine/pure/Command.kt",
                "spine/pure/Context.kt",
                "spine/pure/Effect.kt",
                "spine/pure/Ids.kt",
                "spine/pure/KeyedEffect.kt",
                "spine/pure/Mailbox.kt",
                "spine/pure/Notice.kt",
                "spine/pure/RunStatus.kt",
                "spine/pure/Seams.kt",
                "spine/pure/SpineSlice.kt",
                "spine/pure/Staged.kt",
                "spine/pure/StepRecord.kt",
                "spine/pure/ToolResult.kt",
                "spine/pure/Turn.kt",
                "spine/pure/Verb.kt",
                "spine/pure/View.kt",
                "spine/replay/Replay.kt",
                "spine/surface/Controller.kt",
            ),
            spine,
        )
    }

    /**
     * THE GATE'S ANCHORS. Every konsist rule keys on a NAME, a PATH or a SHAPE —
     * `Ctx`, `RunStatus`, `ViewState.kt`, `Tools.kt`, the `ai.torad` prefix, the
     * `*Result`/`*Command` derivation. C7 demonstrated the failure class: its
     * derivation was keyed to a shape the live tree migrated away from, the rule
     * went quietly vacuous, and its own fixtures — frozen in the old shape — kept
     * its block-test green. This test pins every such anchor against the LIVE
     * tree, so a rename that would de-scope a rule fails HERE, loudly, instead of
     * the rule matching nothing, silently, forever.
     */
    @Test
    fun `ANCHORS - every name, path and shape the gate keys on exists in the live tree`() {
        fun declares(name: String) =
            live.any { f -> f.file.classes(includeNested = true).any { it.name == name } }

        // C7's derivation is NON-EMPTY on the live tree and contains known spellings —
        // the direct pin on the exact rot that shipped.
        val variants = GateFacts().transportVariants(live)
        listOf(
            "TriageResult.SetPriority", "TriageCommand.SetPriority",
            "ToolResult.Refused", "Command.Refused",
        ).forEach { known ->
            assertTrue(known in variants, "C7's derivation lost $known — it is going vacuous again")
        }

        // C4's shape anchors: the tool context really is a class named Ctx, the
        // staged vocabulary really is StagedInput with its two variants, and the
        // stamp types exist where STAMP_TYPES points.
        listOf("Ctx", "StagedInput", "Perceived", "Recalled", "Actor", "Authority", "Signature")
            .forEach { assertTrue(declares(it), "C4 keys on `$it`, which no live file declares") }

        // C5 and C6 key on these import names.
        listOf("KeyedEffect", "EffectKey", "RunStatus")
            .forEach { assertTrue(declares(it), "a check keys on `$it`, which no live file declares") }

        // C2/C15: the spine-owned adr.contract roots are exactly the three the
        // allow-set names — a fourth root would be silently sibling-importable.
        val spineContractRoots = live
            .filter { it.packageName == "adr.contract" && it.path.startsWith("spine/") }
            .flatMap { f -> f.file.classes(includeNested = false).map { it.name } }
            .toSet()
        assertEquals(setOf("ToolResult", "Command", "Effect"), spineContractRoots)

        // C1/C8 key the runtime on the `ai.torad` prefix; the loop must actually
        // import it, or the confinement clause polices a name nothing uses.
        assertTrue(
            live.single { it.path == "spine/agent/Loop.kt" }.imports.any { it.startsWith("ai.torad") },
            "C1's runtime clause keys on `ai.torad`, which spine/agent/Loop.kt no longer imports",
        )

        // C12 keys on ViewState.kt; C4(b) on Tools.kt; the port/adapter pair is the
        // shape §4.6 stakes its claim on. Pin the full per-block rosters, the same
        // move as the spine roster above.
        val blockFiles = live.mapNotNull { f -> f.block?.let { it to f.fileName } }
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, names) -> names.sorted() }
        val core = listOf("Contract.kt", "Fold.kt", "Project.kt", "Register.kt", "Slice.kt", "Tools.kt")
        assertEquals(
            mapOf(
                "analysis" to (core + listOf("Adapter.kt", "Port.kt")).sorted(),
                "artifact" to (core + listOf("Adapter.kt", "Port.kt")).sorted(),
                "console" to (core + listOf("ViewState.kt")).sorted(),
                "escalation" to (core + listOf("Adapter.kt", "Port.kt")).sorted(),
                "inbox" to core.sorted(),
                "triage" to core.sorted(),
            ),
            blockFiles,
        )
    }

    /**
     * G1, the COPY half of C4(d). The detekt half denies `Signature.<init>` as a
     * resolved call — but a `data class` ships a synthesized `copy()`, and
     * `sig.copy(by = Actor.Human)` is a SECOND production site with a different
     * name, invisible to any constructor rule. Signature is therefore a plain
     * class: the second site does not exist in the language. This test is what
     * keeps it deleted — flip the modifier back and this fails before any forge
     * can be written.
     */
    @Test
    fun `C4(d) - Signature is not a data class, so no synthesized copy() exists`() {
        val signature = live
            .single { it.path == "spine/pure/Actor.kt" }
            .file.classes(includeNested = true)
            .single { it.name == "Signature" }
        assertTrue(
            !signature.hasDataModifier,
            "Signature must not be a data class: `copy()` would be a second, " +
                "ungated production site for the stamp (G1)",
        )
    }

    /**
     * G12/§11.2: the edit list for a new state variant is K = 3, and every one of
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
    fun `G12 - a new TicketStatus variant has ZERO consumers outside its own block`() {
        val outside = live
            .filter { it.block != "escalation" && GateTrees().mentions(it.codeText, "TicketStatus") }
            .map { it.path }
        assertEquals(emptyList(), outside, "§11.2 claims K = 3, all inside blocks/escalation/")

        // The variant is DECLARED in exactly one file — the append §11.2 counts as
        // the site you write yourself…
        // Konsist's STRUCTURE, not a substring of the declaration text. The first
        // version of this line read `codeText.contains("sealed interface TicketStatus")`
        // and broke the moment the type became a `sealed class` — a change that altered
        // nothing this assertion is about. A gate keyed on how a declaration is SPELLED
        // fails on rewording and passes on relocation, which is backwards.
        val declaring = live.filter { f ->
            f.block == "escalation" && f.file.classes(includeNested = true).any { it.name == "TicketStatus" }
        }
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
     * 16.1: a new verb touches FOUR appends, three files, one folder — and the
     * same four whether it is a domain verb or a presentation verb.
     *
     * 6.8's carve-out ("a UI tool folds, does not sign") is what 6.8 deletes, and
     * this is the assertion that keeps it deleted: the presentation block has the
     * same file set and declares its verbs with the same constructors as a domain
     * block. There is no cheaper UI path, because there is no UI path.
     */
    @Test
    fun `BLAST RADIUS - a new verb touches FOUR appends, three files, one folder`() {
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
