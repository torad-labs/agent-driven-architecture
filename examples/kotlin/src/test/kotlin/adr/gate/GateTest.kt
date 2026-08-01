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

    @Test fun `C16 - only the admission rule opens the fold's attributed output`() = verify("C16")

    @Test fun `C17 - an Irreversible effect is constructed only at its own site`() = verify("C17")

    /**
     * The roster. Seventeen checks, three homes, and every one of them denying.
     *
     * This test exists so the count cannot quietly drop: deleting a rule deletes a
     * row here too, which is a diff a reviewer sees. 15.3's "roughly four dozen
     * checks" is not the claim being made — the reference ships seventeen, and the
     * point is the denial, not the count.
     */
    @Test
    fun `THE ROSTER - all seventeen checks ship, and each one is enforced somewhere`() {
        val roster = mapOf(
            "C1" to "konsist", "C2" to "konsist", "C3" to "detekt",
            "C4" to "konsist+detekt", "C5" to "konsist", "C6" to "konsist+detekt",
            "C7" to "konsist+detekt", "C8" to "konsist", "C9" to "detekt",
            "C10" to "konsist", "C11" to "konsist", "C12" to "konsist",
            "C13" to "junit-reflection", "C14" to "detekt", "C15" to "konsist",
            // 15 -> 17: the two static halves of docs/DECISIONS.md:85-86. The
            // TypeScript port moves the same pin in the same landing, in its own
            // homes (eslint for C16, vitest for C17), so the two rosters cannot
            // drift apart unnoticed.
            "C16" to "konsist", "C17" to "konsist",
        )
        assertEquals(17, roster.size)

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
     * This port's own arithmetic, PINNED — the same move as the seventeen-check
     * roster above. A counted claim that nothing measures is how "35 files" ships
     * while the tree holds 37, so the count lives HERE, where a spine file added
     * or removed is a diff. This port's README quotes the number; the README text
     * is not itself measured, so a README that disagrees with this pin is a
     * review catch, not a build catch. (The TS port pins its own roster of 37 —
     * one extra ports file there, three pure files here; same components, spelled
     * per language.)
     *
     * 37 -> 38: `spine/pure/Version.kt`, the spine version marker. It is a SOURCE
     * file on purpose — a marker in a build script or a resource would be invisible
     * to this roster and to the TypeScript one, which is exactly the silent-addition
     * class these pins exist to stop. The TypeScript port moves its own 36 -> 37 in
     * the same landing, in its own home, so the two rosters cannot drift apart.
     */
    @Test
    fun `the spine roster is pinned - exactly these 38 files`() {
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
                "spine/pure/Version.kt",
                "spine/pure/View.kt",
                "spine/replay/Replay.kt",
                "spine/surface/Controller.kt",
            ),
            spine,
        )
    }

    /**
     * THE OTHER 49, PINNED AS PATHS — and with them the live tree is a PARTITION.
     *
     * The roster above pins `:spine`'s 37. Until ADR-001 §9's Stages 2-4 landed, the
     * remaining 49 all sat in ONE directory the gate could not miss; they now sit in TEN
     * module roots. WHAT THIS GUARANTEES, exactly: a file added to, removed from or
     * renamed inside a LISTED root cannot be silent — it is an equality over full
     * normalised paths, so the diff is forced here.
     *
     * WHAT IT CANNOT GUARANTEE, stated so nobody reads more into it: it is built from
     * `live`, which is built from `GateTrees.MODULE_ROOTS`, so a file under a root
     * nobody listed is not in `live` and cannot fall out of this list. That case is
     * owned by build.gradle.kts's `gateCompiledRootsAreGateRoots` (a compiled root that
     * is not a gate root) and `gateNoSourceOutsideAdr` (a file beside `adr/` inside a
     * root that is listed). Nor can any of the three see a file that changed MODULE
     * without changing its normalised path — an equality over paths is by construction
     * blind to exactly what normalisation threw away. That is the MODULE OWNERSHIP test
     * below, and it is ONE wall with TWO clauses.
     *
     * FOUR WALLS, FIVE DISJOINT ESCAPES: the two rosters here (a path that moved inside
     * a listed root), `gateCompiledRootsAreGateRoots` (a compiled root nobody listed),
     * `gateNoSourceOutsideAdr` (a file beside `adr/` in a listed root), and MODULE
     * OWNERSHIP's two clauses — a file that changed MODULE without changing its
     * normalised path, and a block's live rim compiling on the pure side of §5's pair.
     *
     * WHAT THIS ADDS over what was already pinned, so it is an extension and not a second
     * detector at the same layer: the ANCHORS test pins each block's file NAMES grouped by
     * `GateFile.block`, which covers 43 of these 49 but says nothing about the `app/` tier
     * (6 files, previously pinned only as the single `app/Wire.kt` lookup) and nothing
     * about how a path is SPELLED. The equality here is over full normalised paths, and
     * the size assertion closes the partition: 38 + 49 = 87, so every file the gate reads
     * is named by one of the two rosters and a disappearance cannot be silent.
     */
    @Test
    fun `the blocks and app roster is pinned - exactly these 49 files`() {
        val rest = live.map { it.path }.filterNot { it.startsWith("spine/") }.sorted()
        assertEquals(
            listOf(
                "app/Assemble.kt",
                "app/Contract.kt",
                "app/Demo.kt",
                "app/Main.kt",
                "app/Narrator.kt",
                "app/Wire.kt",
                "blocks/analysis/Adapter.kt",
                "blocks/analysis/Contract.kt",
                "blocks/analysis/Fold.kt",
                "blocks/analysis/Port.kt",
                "blocks/analysis/Project.kt",
                "blocks/analysis/Register.kt",
                "blocks/analysis/Slice.kt",
                "blocks/analysis/Tools.kt",
                "blocks/artifact/Adapter.kt",
                "blocks/artifact/Contract.kt",
                "blocks/artifact/Fold.kt",
                "blocks/artifact/Port.kt",
                "blocks/artifact/Project.kt",
                "blocks/artifact/Register.kt",
                "blocks/artifact/Slice.kt",
                "blocks/artifact/Tools.kt",
                "blocks/console/Contract.kt",
                "blocks/console/Fold.kt",
                "blocks/console/Project.kt",
                "blocks/console/Register.kt",
                "blocks/console/Slice.kt",
                "blocks/console/Tools.kt",
                "blocks/console/ViewState.kt",
                "blocks/escalation/Adapter.kt",
                "blocks/escalation/Contract.kt",
                "blocks/escalation/Fold.kt",
                "blocks/escalation/Port.kt",
                "blocks/escalation/Project.kt",
                "blocks/escalation/Register.kt",
                "blocks/escalation/Slice.kt",
                "blocks/escalation/Tools.kt",
                "blocks/inbox/Contract.kt",
                "blocks/inbox/Fold.kt",
                "blocks/inbox/Project.kt",
                "blocks/inbox/Register.kt",
                "blocks/inbox/Slice.kt",
                "blocks/inbox/Tools.kt",
                "blocks/triage/Contract.kt",
                "blocks/triage/Fold.kt",
                "blocks/triage/Project.kt",
                "blocks/triage/Register.kt",
                "blocks/triage/Slice.kt",
                "blocks/triage/Tools.kt",
            ),
            rest,
            "the blocks/ + app/ roster moved. A file that fell out landed under a root " +
                "GateTrees.MODULE_ROOTS does not list, and no konsist check reads it",
        )

        assertEquals(
            87,
            live.size,
            "the live tree is the two rosters and nothing else: 38 spine + 49 blocks/app",
        )
    }

    /**
     * THE MODULE ROOTS ARE FAIL-CLOSED — the pin that makes ADR-001 §3's DAG safe to
     * migrate one stage at a time.
     *
     * Under the DAG the live tree is no longer one directory: `GateTrees().MODULE_ROOTS`
     * lists a root per source-bearing module and detekt is given the same list
     * (`build.gradle.kts`'s `adrModuleSourceRoots`). That creates a failure mode this
     * repository has already been bitten by once, at C7: a module whose sources exist
     * and whose root is in NEITHER list is invisible to all eleven konsist checks and
     * to C3/C9/C14, while every test stays green. Forty-three files' worth, for
     * `:spine` alone.
     *
     * So the roots are DERIVED FROM DISK here and compared both ways. A stage that
     * moves a block's files into `block/<x>/` and forgets either list fails HERE,
     * before it can ship a gate reading two thirds of the tree.
     */
    @Test
    fun `MODULE ROOTS - konsist and detekt read every module source root that exists on disk`() {
        val projectRoot = java.io.File(".").canonicalFile
        val onDisk = projectRoot.walkTopDown()
            .onEnter { it.name != "build" && it.name != "node_modules" && !it.name.startsWith(".") }
            .filter { dir ->
                dir.isDirectory && dir.name == "adr" &&
                    dir.parentFile.invariantSeparatorsPath.endsWith("/src/main/kotlin")
            }
            .map { it.relativeTo(projectRoot).invariantSeparatorsPath }
            .toSortedSet()

        assertEquals(
            GateTrees().MODULE_ROOTS.toSortedSet(),
            onDisk,
            "GateTrees().MODULE_ROOTS does not match the module source roots on disk. A root that " +
                "exists and is not listed is a whole module no konsist check reads.",
        )

        // detekt's own source list, from the other side of the build boundary.
        val declared = Regex("""val adrModuleSourceRoots = listOf\(([^)]*)\)""")
            .find(java.io.File("build.gradle.kts").readText())
        val declaredRoots = checkNotNull(declared) {
            "build.gradle.kts no longer declares `adrModuleSourceRoots`"
        }
        val detektRoots = Regex("\"([^\"]+)\"").findAll(declaredRoots.groupValues[1])
            .map { it.groupValues[1] }
            .toSortedSet()
        assertEquals(
            GateTrees().MODULE_ROOTS.map { it.removeSuffix("/adr") }.toSortedSet(),
            detektRoots,
            "detekt (C3/C9/C14) and konsist (C1-C15) are reading different trees",
        )
    }

    /**
     * MODULE OWNERSHIP — a normalised path is PINNED to the modules that may own it,
     * and a block's live rim is PINNED to the IO leaf of ADR-001 §5's ratified pair.
     *
     * THE HOLE THIS CLOSES, executed rather than imagined. Normalisation is deliberately
     * lossy: eleven module roots collapse onto one relative namespace so that every
     * selector, roster and anchor above keeps binding unedited. The price is that a file
     * can change MODULE without changing its path, and the module is where §5's
     * pure/adapter split has teeth — the IO-library ban is a CLASSPATH ban keyed on the
     * Gradle module (`adr.spine` and `adr.block` are its only two owners, ADR-001:366,
     * and settings.gradle.kts:56-70 is what binds a module DIRECTORY to the role plugin
     * carrying that ban), while every rule in Rules.kt and every pin above is keyed on
     * the normalised path. Two measured escapes, both BUILD SUCCESSFUL before this test:
     *
     *   ADAPTER INTO PURE. Move a block's live adapter out of `:block:<x>:adapter` into
     *       `:block:<x>`, delete the emptied `src` tree, drop the two root-list entries.
     *       The result is shape-identical to the three legitimately source-free adapter
     *       modules, so `gateSourceRootsPresent`, `gateCompiledRootsAreGateRoots` and
     *       `gateNoSourceOutsideAdr` are all correctly silent — and the block's live IO
     *       now compiles inside the module `adr.block` declares pure. RENAMING the file
     *       on the way (`Adapter.kt` -> `Rim.kt`) buys the entire exploit back from any
     *       rule keyed on the file NAME, which is why RIM OCCUPANCY below is keyed on
     *       SUPERTYPES instead, and why [GateTrees.owedRoots] deliberately permits
     *       either member of the pair for a block file.
     *   PURE INTO APP. Move `spine/surface/Controller.kt` from `:spine` into `:app`. It
     *       is referenced only by `app/Wire.kt`, so it compiles; both root lists stay
     *       untouched because both roots still hold Kotlin; the file is still
     *       `spine/surface/Controller.kt` to every rule and roster. `:app` is the
     *       composition root and `adr.root.gradle.kts` applies no
     *       `denyExternalLibrariesExcept`, so an arbitrary third-party IO library
     *       follows the file across: MEASURED, the coordinate `org.postgresql:postgresql`
     *       FAILS CONFIGURATION on `:spine` ("`:spine` is PURE — ADR-001 §3 forbids an
     *       IO/external library on its classpath") and is BUILD SUCCESSFUL on `:app`
     *       with the relocated file importing `org.postgresql.Driver`.
     *
     * WHAT THIS DOES NOT CLOSE, measured rather than assumed, because a wall whose KDoc
     * overclaims is worse than no KDoc. `denyExternalLibrariesExcept`
     * (build-logic/src/main/kotlin/AdrDag.kt:216-229) filters `ExternalModuleDependency`
     * and checks `"${dep.group}:${dep.name}"` — Gradle COORDINATES. A JDK package has no
     * coordinate, so it was never gated in any module: `import java.sql.DriverManager`
     * inside the UNMOVED `spine/surface/Controller.kt` is BUILD SUCCESSFUL today. That
     * gap belongs to C8's impure-import prefix list (Rules.kt:288-292, which names
     * `java.io|java.net|java.nio|kotlinx.coroutines|ai.torad` and not `java.sql`), and
     * widening it is a separate invariant owing its own fixture pair. This test closes
     * the RELOCATION, not that gap.
     *
     * WHY HERE AND NOT AS AN EIGHTEENTH KONSIST CHECK: this is a roster-class pin, the
     * same kind as MODULE ROOTS and the two path rosters above, and it lives beside
     * them. A C18 would have to enter THE ROSTER map and its size assertion, and would
     * owe an on-disk fixture pair the shape cannot produce without standing up a SECOND
     * live module tree — a [GateFile] wraps a Konsist declaration and cannot be forged.
     * The pair is therefore in-checker, and its inputs are DERIVED FROM `live` rather
     * than frozen as path literals: a frozen pair survives the very relocation it exists
     * to deny, goes on asserting about a path that no longer exists in any module root,
     * and stays green. That is C7's rot one seam over, and it is what the predecessor of
     * this test shipped.
     */
    @Test
    fun `MODULE OWNERSHIP - a path names its module, and a block rim occupies the IO leaf`() {
        val trees = GateTrees()
        fun blockOf(file: GateFile): String =
            checkNotNull(file.block) { "${file.path} is not a block file" }

        // ── (i) LIVE, path tier ──────────────────────────────────────────────
        assertEquals(
            emptyList(),
            live.mapNotNull { trees.ownershipViolation(it.path, it.root) },
            "a file was compiled in a module its own path does not name. The normalised " +
                "path is what every rule reads; the MODULE is what the classpath bans " +
                "are keyed on, and this is the only place the two are tied together",
        )

        // ── (ii) LIVE, rim occupancy ─────────────────────────────────────────
        val rim = trees.rimClasses(live)
        assertEquals(
            emptyList(),
            rim.mapNotNull { trees.rimViolation(it) },
            "a block's live rim compiled outside the IO leaf of ADR-001 §5's pair",
        )

        // ── (iii) RIM ANCHOR — C7's rot, refused in advance ──────────────────
        // The derivation walks supertypes, so it goes vacuous the day a Port.kt is
        // deleted, an interface is renamed, or Konsist's parents()/interfaces()/
        // objects() API drifts — and a derivation that walked to nothing agrees with
        // any tree at all. ADR-001:412 names the three classes that leave
        // `:block:<x>` for the leaf; §4.6/G11 names the ports they implement.
        assertEquals(
            setOf("LiveDelivery", "LivePager", "LiveRelayWriter"),
            rim.map { it.className }.toSet(),
            "the rim derivation moved — it is going vacuous. ADR-001:412 freezes " +
                "exactly these three classes into the adapter leaf",
        )
        assertEquals(
            setOf("AnalysisRelay", "DeliveryPort", "OncallPort"),
            rim.map { it.port }.toSet(),
            "the block PORT set the rim derivation reads moved (§4.6/G11)",
        )

        // ── (iv) TIE-BACK — the roots this derivation spells are the DAG's ───
        // `GateFile.root` really carries the root its file was read from…
        assertEquals(
            trees.MODULE_ROOTS.toSortedSet(),
            live.map { it.root }.toSortedSet(),
            "GateFile.root is not carrying the module root its file was read from",
        )
        // …and `pureRoot`/`adapterRoot` really name Gradle module directories, which is
        // otherwise an inference from a naming convention: that the normalised
        // `blocks/<x>/` segment IS the module directory name. settings.gradle.kts:60-63
        // pins the project PATHS; this pins the DIRECTORIES they are read from.
        assertEquals(
            emptyList(),
            live.mapNotNull { it.block }.distinct().sorted()
                .filterNot { trees.pureRoot(it) in trees.MODULE_ROOTS },
            "a block's normalised `blocks/<x>/` segment no longer names its Gradle " +
                "module directory, so `pureRoot` derives a root the DAG does not have",
        )
        assertEquals(
            emptyList(),
            rim.map { it.block }.distinct().sorted()
                .filterNot { trees.adapterRoot(it) in trees.MODULE_ROOTS },
            "a block with a live rim has no adapter root in the DAG",
        )

        // ── (v) BLOCK-TEST — every case REJECTED, every input derived from `live` ─
        val pure = live.first { it.block != null && it.fileName == "Tools.kt" }
        val contract = live.first { it.block != null && it.fileName == "Contract.kt" }
        val spineFile = live.first { it.path.startsWith("spine/") }
        val appFile = live.first { it.path.startsWith("app/") }

        // The fail-closed default, OBSERVED rather than assumed: a path outside all
        // three tiers is owed the EMPTY set, and no root is a member of it.
        assertEquals(
            emptySet(),
            trees.owedRoots("Loose.kt"),
            "the fail-closed default must own a path that normalised outside the tiers",
        )

        listOf(
            // PURE INTO ADAPTER — the direction the item calls the worse one. Single-
            // sourced from Rules.kt's PURE_BLOCK_FILES, so it cannot drift from C8.
            pure.path to trees.adapterRoot(blockOf(pure)),
            // a block CONTRACT out of `:spine` — Kotlin's sealed rule, run backwards.
            contract.path to trees.pureRoot(blockOf(contract)),
            // the two tier relocations, both measured live.
            spineFile.path to trees.APP_ROOT,
            appFile.path to trees.SPINE_ROOT,
            // and the fail-closed branch, driven.
            "Loose.kt" to trees.SPINE_ROOT,
        ).forEach { (path, root) ->
            assertTrue(
                trees.ownershipViolation(path, root) != null,
                "MODULE OWNERSHIP BLOCK-TEST: `$path` read from `$root` was ACCEPTED. " +
                    "A check nobody has watched fail is not a check",
            )
        }

        // RIM BLOCK-TEST — each live rim, re-pointed at a root that is not its leaf.
        // Synthetic because a RimClass is four Strings; derived because the class, the
        // port and the block all come out of `live`.
        assertTrue(rim.isNotEmpty(), "the rim derivation is empty — these cases are vacuous")
        val otherBlock = rim.map { it.block }.distinct()
        assertTrue(otherBlock.size > 1, "one rim block only — the cross-block case is vacuous")
        rim.forEach { r ->
            listOf(
                trees.pureRoot(r.block),
                trees.SPINE_ROOT,
                trees.APP_ROOT,
                trees.adapterRoot(otherBlock.first { it != r.block }),
            ).forEach { root ->
                assertTrue(
                    trees.rimViolation(RimClass(r.className, r.port, r.block, root)) != null,
                    "RIM BLOCK-TEST: `${r.className}` read from `$root` was ACCEPTED",
                )
            }
        }

        // ── (vi) ALLOW-TEST — the ratified layout, ACCEPTED ──────────────────
        val leafReads = live.filter { f -> f.block?.let { trees.adapterRoot(it) == f.root } == true }
        assertTrue(leafReads.isNotEmpty(), "no live file is read from an IO leaf — vacuous")

        val allowed = leafReads.map { it.path to it.root } +
            // A SECOND, differently-named file in that same leaf.
            // `docs/DECISIONS.md:53-56` gives `:block:<x>:adapter` "IO allowed" and
            // fixes neither a file count nor a file name; ADR-001:412 freezes the three
            // CLASSES, not `Adapter.kt`. The predecessor of this test rejected exactly
            // this, with the inverted remediation
            // "…owe it to `block/<x>/src/main/kotlin/adr`".
            leafReads.flatMap { f ->
                listOf("Client.kt", "Rim.kt", "Wire.kt").map {
                    "blocks/${blockOf(f)}/$it" to f.root
                }
            } +
            // and the ratified exceptions run FORWARDS.
            listOf(
                pure.path to trees.pureRoot(blockOf(pure)),
                contract.path to trees.SPINE_ROOT,
                spineFile.path to trees.SPINE_ROOT,
                appFile.path to trees.APP_ROOT,
            )
        allowed.forEach { (path, root) ->
            assertEquals(
                null,
                trees.ownershipViolation(path, root),
                "MODULE OWNERSHIP ALLOW-TEST: the ratified layout was rejected (15.2)",
            )
        }
    }

    /**
     * N-ROOT NORMALISATION: the module roots emit the SAME relative paths the
     * single-module tree did, and the fixture marker is still DERIVED per root.
     *
     * This is what makes the whole gate migration free — every selector in Rules.kt and
     * every path pin in this file keys on the normalised path, so `spine/pure/Actor.kt`
     * and `blocks/triage/Contract.kt` have to come back spelled exactly that way from a
     * module root they no longer share.
     *
     * The second half is the refuted prescription, kept as a permanent assertion: fixing
     * the marker GLOBALLY (for `fixtureTree` too) makes `substringAfter` return whole
     * ABSOLUTE paths for every fixture, `GateFile.block` go null, and C1/C2/C6/C7/C8/
     * C11/C12/C15 report their violating fixtures ACCEPTED. Measured: eight failures.
     */
    @Test
    fun `N-ROOT NORMALISATION - live paths stay relative and the six block contracts still key on their block`() {
        // (a) every live path is relative and inside one of the three tiers §1.3 names.
        live.forEach { file ->
            assertTrue(
                file.path.startsWith("spine/") || file.path.startsWith("blocks/") || file.path.startsWith("app/"),
                "`${file.path}` normalised outside spine/, blocks/ and app/ — the marker is wrong for its root",
            )
        }

        // (b) the six block contracts now live in the `:spine` MODULE (Kotlin's sealed
        // rule) and must still normalise under blocks/, or C8's purity clause, C2's
        // prefix clause and the per-block roster all silently stop covering them.
        val contracts = live.filter { it.fileName == "Contract.kt" && it.block != null }
        assertEquals(
            listOf(
                "blocks/analysis/Contract.kt",
                "blocks/artifact/Contract.kt",
                "blocks/console/Contract.kt",
                "blocks/escalation/Contract.kt",
                "blocks/inbox/Contract.kt",
                "blocks/triage/Contract.kt",
            ),
            contracts.map { it.path }.sorted(),
        )
        contracts.forEach { contract ->
            assertTrue(
                contract.fileName in PURE_BLOCK_FILES,
                "C8 selects a block file by `fileName in PURE_BLOCK_FILES`; ${contract.path} fell out",
            )
        }

        // (c) fixture paths are RELATIVE, which is what the per-root derived marker buys.
        val fixture = GateTrees().fixtureTree("violating", "C1").map { it.path }
        assertEquals(listOf("blocks/triage/Fold.kt"), fixture)
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

        // C16 keys on a MEMBER NAME and on the path of the file that declares it — and
        // on that member being PRIVATE, which is the actual wall. A widening of the
        // visibility would leave the rule matching nothing while its own frozen fixtures
        // kept its block-test green: the C7 rot, one seam over.
        val home = live.single { it.path == ADMISSION_HOME }
        val attributed = home.file.classes(includeNested = true).single { it.name == "Attributed" }
        val member = attributed.primaryConstructor?.parameters.orEmpty()
            .single { it.name == ATTRIBUTION_MEMBER }
        assertTrue(
            member.hasModifier(com.lemonappdev.konsist.api.KoModifier.PRIVATE),
            "`Attributed.$ATTRIBUTION_MEMBER` must stay PRIVATE — C16 is the tripwire on " +
                "that widening, not the wall itself",
        )
        assertTrue(
            !attributed.hasDataModifier,
            "`Attributed` must not be a data class: `componentN()` would be a second " +
                "spelling of the read C16 denies, invisible to any text rule",
        )

        // C17's derivation is NON-EMPTY, is EXACTLY the two leaves the tree declares,
        // and each pinned site really constructs its leaf the pinned number of times. A
        // derivation that walked to nothing agrees with any tree at all — the direct pin
        // on the rot that shipped.
        val irreversible = GateFacts().irreversibleLeaves(live)
        assertEquals(
            setOf("DeliverArtifact", "PageOncall"),
            irreversible.map { it.name }.toSet(),
            "C17's Irreversible-leaf derivation moved — it is going vacuous",
        )
        assertEquals(irreversible.map { it.name }.toSet(), IRREVERSIBLE_SITES.keys)
        val c17 = CHECKS.single { it.id == "C17" }
        irreversible.forEach { leaf ->
            val pinned = IRREVERSIBLE_SITES.getValue(leaf.name)
            val site = live.single { it.path == pinned.path }
            val held = GateFacts().spellingsOf(site, leaf)
                .sumOf { GateTrees().constructions(site.codeText, it) }
            assertEquals(
                pinned.constructions,
                held,
                "${leaf.name}'s pinned site ${site.path} no longer constructs it exactly " +
                    "${pinned.constructions} time(s) — the roster is watching a file that moved",
            )
        }
        assertEquals(emptyList(), c17.run(live), "C17 must pass on the live tree")

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

    // ── THE HANDLER SPLIT'S HEADLINE, MEASURED ON BOTH TREES ──────────────────
    // No compiler fixture can settle this on its own. `gateEffectKindBlockTest` proves
    // the compiler names ONE site — the block's own performer — for an appended effect
    // kind; what it cannot prove is that the site list it produced is the WHOLE list,
    // because a fixture compiled on its own has no composition root and no gate in it.
    // So the real trees are asked directly, and BOTH of them: `src/main` for the
    // production claim, `src/test` for the cost that moved there.

    /** The effect LEAVES, derived from the live tree — never listed. Every class whose
     *  direct parent name ends in `Effect`, minus the sub-union ROOTS, which are
     *  themselves such classes and are not leaves. */
    private fun effectLeaves(): Set<String> = live
        .flatMap { f -> f.file.classes(includeNested = true) }
        .filter { cls -> cls.parents(indirectParents = false).any { it.name.endsWith("Effect") } }
        .map { it.name }
        .filterNot { it.endsWith("Effect") }
        .toSet()

    /** The four block sub-unions, derived the same way: a class whose direct parent is
     *  `Effect` itself and whose own name ends in `Effect`. */
    private fun effectSubUnions(): Set<String> = live
        .flatMap { f -> f.file.classes(includeNested = true) }
        .filter { cls -> cls.parents(indirectParents = false).any { it.name == "Effect" } }
        .map { it.name }
        .filter { it.endsWith("Effect") }
        .toSet()

    /**
     * THE ANTI-VACUITY PIN, and it deliberately does NOT enumerate the leaves.
     *
     * An equality against a spelled-out five-name set would be stronger against a
     * silent rename — and would also make THIS FILE a per-effect-kind edit, i.e. a
     * second out-of-folder site for exactly the append the census exists to price.
     * Worse, the ledger census below keys on "names every declared leaf", so a
     * spelled-out set would put this file in its own result and keep it there.
     *
     * So the pin is DERIVED instead: the spine's own `Diag` is always a leaf, the four
     * sub-unions are pinned as an equality (a set no leaf append moves), and every
     * sub-union must contribute at least one leaf. A derivation that walked to nothing,
     * or lost `Diag`, or de-scoped a whole sub-union, fails here; adding a kind does not.
     */
    private fun assertDerivationsBind() {
        val leaves = effectLeaves()
        val subUnions = effectSubUnions()
        assertEquals(
            setOf("TriageEffect", "EscalationEffect", "ArtifactEffect", "AnalysisEffect"),
            subUnions,
            "the sub-union derivation moved — it is going vacuous",
        )
        assertTrue("Diag" in leaves, "the spine's own effect leaf vanished from the derivation")
        assertTrue(
            leaves.size >= subUnions.size + 1,
            "every sub-union contributes at least one leaf, plus Diag: $leaves vs $subUnions",
        )
    }

    /**
     * PRODUCTION: a novel effect kind has ZERO consumers outside the block that owns it.
     *
     * BEFORE the split the answer included `app/Wire.kt` for all four unions — the
     * exhaustive `when` over Effect that made a new kind an out-of-folder append. This
     * test is red on that tree and green on this one, which is the whole delta expressed
     * as a check rather than as a claim.
     *
     * The block contracts live in the `:spine` MODULE (Kotlin's sealed rule) and
     * normalise back under `blocks/<x>/`, which the N-ROOT NORMALISATION test above
     * pins — so "inside the block" here means what it means everywhere else in this file.
     */
    @Test
    fun `a novel effect kind has ZERO production consumers outside its own block`() {
        val outside = listOf("triage", "escalation", "artifact", "analysis").flatMap { block ->
            val union = block.replaceFirstChar { it.uppercase() } + "Effect"
            live.filter { it.block != block && GateTrees().mentions(it.codeText, union) }
                .map { "${it.path} names $union" }
        }
        assertEquals(
            emptyList(),
            outside,
            "an effect sub-union named outside its own block folder — a novel kind is an " +
                "out-of-folder PRODUCTION append again",
        )

        // The derivations are non-vacuous — a derivation that quietly walked to nothing
        // would agree with any tree at all. That is the C7 rot, refused in advance.
        assertDerivationsBind()

        // …and the composition root names exactly ONE effect kind: the spine's own Diag,
        // which the split keeps there. A root that quietly kept a second branch would
        // satisfy the assertion above (Effect.Diag is not a sub-union) and fail this one.
        val root = live.single { it.path == "app/Wire.kt" }
        val kinds = effectLeaves().filter { GateTrees().mentions(root.codeText, it) }.sorted()
        assertEquals(listOf("Diag"), kinds, "the root performs the spine's effect and no other")
    }

    /**
     * THE GATE'S OWN TREE — where the split's remaining out-of-folder cost actually is.
     *
     * The composition root does not move for a novel effect kind; the gate's TOTALITY
     * LEDGER does, exactly as it already does for a novel VERB. That cost was invisible
     * to every instrument this port shipped, because [GateTrees.liveTree] walks
     * `src/main` only. It is visible now, and asserted as an EQUALITY in both
     * directions rather than as an absence: a THIRD ledger appearing is as red as the
     * existing one losing its enumeration.
     *
     * TWO SETS, and the distinction is the whole point:
     *
     *   LEDGERS    a file that enumerates EVERY declared leaf. Appending a kind forces
     *              an edit here — this is the out-of-folder cost, counted.
     *   ASSEMBLERS a file that reaches the shipped dispatcher assembly. Pinned so the
     *              set of places that exercise the real performer list cannot silently
     *              shrink to none, which is how a dispatcher test goes decorative.
     *
     * A file naming SOME leaf or sub-union is deliberately NOT pinned here: twelve of
     * the gate's test files assert about kinds that already exist, a novel kind touches
     * none of them, and a twelve-file roster over that would be churn without signal.
     */
    @Test
    fun `the out-of-folder cost of a novel effect kind is EXACTLY the gate's own ledger`() {
        assertDerivationsBind()
        val leaves = effectLeaves()

        val tree = GateTrees().testTree()
        assertTrue(
            tree.size > 15,
            "the TEST tree walked to ${tree.size} files — the marker is not binding",
        )

        val ledgers = tree
            .filter { f -> leaves.all { GateTrees().mentions(f.codeText, it) } }
            .map { it.path }
            .toSet()
        assertEquals(
            setOf("app/TotalityTest.kt"),
            ledgers,
            "EXACTLY one file outside a block folder enumerates the effect leaves: the " +
                "gate's own totality ledger. That is the whole out-of-folder cost of a " +
                "novel effect kind in this port, and the composition root is not in it",
        )

        val assemblers = tree
            .filter { GateTrees().mentions(it.codeText, "effectPerformers") }
            .map { it.path }
            .sorted()
        assertEquals(
            listOf("app/TotalityTest.kt", "gate/GateTest.kt", "spine/ReplayTest.kt"),
            assemblers,
            "the SHIPPED dispatcher assembly must stay under test from both sides: C13's " +
                "handler half exercises it whole and thinned, ReplayTest drives the same " +
                "assembly through REPLAY, and this census names it too. A set that shrank " +
                "would leave a dispatcher nobody runs the real version of",
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
     * ROW 1 OF THE BLAST-RADIUS TABLE, AS A DENYING FUNCTION over any tree.
     *
     * Written over `List<GateFile>` rather than over `live`, for the reason [verify]
     * gives one screen up: the SAME code that measures the tree it describes can then
     * be pointed at a deliberately violating fixture and at a compliant one. §15.2's
     * bar is that a rule nobody has watched reject something is not a rule, and the
     * predecessor of this census is what that bar is about — see the test below.
     *
     * THE CLAIM, per transport case: the live files that NAME it are EXACTLY the
     * owning block's `Contract.kt`, `Fold.kt` and `Tools.kt`. Three files, one block
     * folder, zero production sites outside it. A site that escaped — a root branch, a
     * sibling reach, a spine special case — joins that set and the equality names it.
     *
     * DERIVED, NEVER ENUMERATED. A spelled-out case list would make this file an edit
     * per verb — a fourth site for the append it is pricing — and the census would then
     * be reporting its own maintenance. So the cases come off Konsist's parse tree
     * (direct parents of the block's own two sealed unions) and the anti-vacuity guards
     * are shape guards instead of a list: every block declares at least one case, the
     * `Result` and `Command` halves carry the SAME names (a verb is a PAIR — sites 1
     * and 2), and no two blocks share a case name, which is what makes a NAME census
     * exact rather than approximate.
     *
     * SITE 3 IS COUNTED THROUGH THE RESOLVER, NOT THROUGH THE TEXT. The number of
     * classified `Verb` rows in the block's table must equal the number of cases — and
     * "classified `Verb` row" is resolved by [GateFacts.spellingsOf] from the file's own
     * imports and typealiases, never matched as the literal string `Verb.Reversible`.
     * The difference is a false positive on a compliant tree: `import
     * adr.spine.pure.Verb.Reversible` and then `Reversible(` is the same table written
     * one keystroke differently, and a spelling-keyed clause rejects it. This one does
     * not, and the compliant fixture is authored in exactly that idiom so the ACCEPT is
     * measured rather than argued.
     *
     * UNIFORMITY IS THE SAME CLAUSE, not a second one. §6.8's deleted carve-out ("a UI
     * tool folds, does not sign") would show up here as the presentation block getting a
     * smaller site set or an unsigned table; it gets neither, because every block goes
     * through the same loop.
     */
    private fun rowOneViolations(files: List<GateFile>, verbPackage: String): List<Violation> {
        val trees = GateTrees()
        val facts = GateFacts()
        val problems = mutableListOf<Violation>()
        val owedFiles = listOf("Contract.kt", "Fold.kt", "Tools.kt")

        val complete = files.mapNotNull { it.block }.distinct().sorted().filter { block ->
            val present = files.filter { it.block == block }.map { it.fileName }.toSet()
            val missing = owedFiles.filterNot { it in present }
            if (missing.isEmpty()) {
                true
            } else {
                problems += Violation("blocks/$block/", "row 1 names three files, and $missing are absent")
                false
            }
        }
        if (complete.isEmpty()) {
            problems += Violation("blocks/", "the block derivation walked to nothing — this census is vacuous")
            return problems
        }

        fun casesOf(block: String, union: String): Set<String> =
            files.single { it.path == "blocks/$block/Contract.kt" }
                .file.classes(includeNested = true)
                .filter { cls -> cls.parents(indirectParents = false).any { it.name == union } }
                .map { it.name }
                .toSet()

        val verbCases = complete.associateWith { block ->
            val cap = block.replaceFirstChar { it.uppercaseChar() }
            val results = casesOf(block, "${cap}Result")
            val commands = casesOf(block, "${cap}Command")
            val contract = "blocks/$block/Contract.kt"
            if (results.isEmpty()) {
                problems += Violation(contract, "$block declares no ToolResult case — the derivation broke")
            }
            if (results != commands) {
                problems += Violation(
                    contract,
                    "$block: a verb is a PAIR of cases; the Result and Command halves disagree — " +
                        "Result ${results.sorted()}, Command ${commands.sorted()}",
                )
            }
            results
        }

        val everyCase = verbCases.values.flatten()
        val shared = everyCase.groupingBy { it }.eachCount().filterValues { it > 1 }.keys.sorted()
        if (shared.isNotEmpty()) {
            problems += Violation(
                "blocks/*/Contract.kt",
                "two blocks share the case name(s) $shared, so a NAME census stops being exact",
            )
        }

        verbCases.forEach { (block, cases) ->
            cases.sorted().forEach { case ->
                val touched = files.filter { trees.mentions(it.codeText, case) }.map { it.path }.toSet()
                val owed = owedFiles.map { "blocks/$block/$it" }.toSet()
                if (touched != owed) {
                    problems += Violation(
                        "blocks/$block/Contract.kt",
                        "$case: THREE FILES, ONE FOLDER is the row-1 claim, and this verb breaks it — " +
                            "it is named in ${touched.sorted()}",
                    )
                }
            }

            // Site 3: one CLASSIFIED, signed row per case — counted over every spelling
            // this file itself binds `adr.spine.pure.Verb`'s two classifications to.
            val tools = files.single { it.path == "blocks/$block/Tools.kt" }
            val rows = setOf("Reversible", "Irreversible").sumOf { classification ->
                facts.spellingsOf(tools, verbPackage, "Verb", classification)
                    .sumOf { trees.constructions(tools.codeText, it) }
            }
            if (rows != cases.size) {
                problems += Violation(
                    tools.path,
                    "$block declares ${cases.size} transport case(s) and holds $rows classified " +
                        "`Verb` row(s) — site 3 is one classified row per verb",
                )
            }
            if (!trees.mentions(tools.codeText, "sign")) {
                problems += Violation(
                    tools.path,
                    "$block's verbs must SIGN — there is no cheaper presentation path",
                )
            }
        }
        return problems
    }

    /**
     * ROW 1 OF THE BLAST-RADIUS TABLE, MEASURED — the row `docs/DECISIONS.md:122`
     * schedules: a verb whose effects reuse effect kinds that already exist.
     *
     * THIS TEST USED TO LIE, and the lie is worth recording because it is the exact
     * shape §15.2 warns about. Its name said "FOUR appends, three files, one folder";
     * its body asserted that each block owns the six block files and that console's
     * `Tools.kt` contains the substrings `Verb.Reversible(` and `sign =`. It counted no
     * appends and checked no containment — a vacuous instrument wearing the name of the
     * result it did not measure, in the one file whose job is to deny exactly that.
     *
     * WHAT IT MEASURES NOW: [rowOneViolations], on the live tree, on a violating
     * fixture and on a compliant one — plus the MODULE clause, which is live-only
     * because a fixture tree has no Gradle modules to be read from.
     *
     * THE MODULE CLAUSE is why `docs/DECISIONS.md:122` schedules this row at all. The
     * three files are ONE FOLDER and TWO MODULES: `Contract.kt` is read from `:spine`,
     * because Kotlin seals a hierarchy within one module and a block's transport
     * therefore has to be authored in the shared core, while `Tools.kt` and `Fold.kt`
     * are read from the block's own `:block:<x>`. The retired slogan was never wrong
     * about the FOLDER — this census measures it and it holds — it was wrong about the
     * compilation unit, and the honest replacement is the split, asserted. `GateFile.root`
     * is what makes it assertable: normalisation deliberately throws the module away,
     * and this is one of the two places that keeps it.
     */
    @Test
    fun `BLAST RADIUS - a verb reusing effect kinds costs three files, one folder, TWO modules`() {
        val trees = GateTrees()

        // TIE-BACK, and the anti-vacuity guard on the resolver: the package the census
        // resolves `Verb` out of is really the package the spine declares it in. A
        // resolver aimed at a package nobody uses resolves nothing and counts zero.
        val verbHome = live.single { f -> f.file.classes(includeNested = true).any { it.name == "Verb" } }
        assertEquals("spine/pure/Verb.kt", verbHome.path, "the verb union moved; the census is aimed at a ghost")
        assertEquals(VERB_PACKAGE, verbHome.packageName, "the verb union changed package")

        assertEquals(
            emptyList(),
            rowOneViolations(live, VERB_PACKAGE).map { "${it.path} — ${it.message}" },
            "row 1 of the blast-radius table is false on the tree it describes",
        )

        // ── THE MODULE SPLIT — one folder, two Gradle modules ────────────────
        live.mapNotNull { it.block }.distinct().sorted().forEach { block ->
            assertEquals(
                trees.SPINE_ROOT,
                live.single { it.path == "blocks/$block/Contract.kt" }.root,
                "$block's transport left :spine, so Kotlin's sealed rule is being broken or bypassed",
            )
            listOf("Fold.kt", "Tools.kt").forEach { name ->
                assertEquals(
                    trees.pureRoot(block),
                    live.single { it.path == "blocks/$block/$name" }.root,
                    "$block/$name is not read from its own :block:$block module",
                )
            }
        }

        // ── BLOCK-TEST — the violating fixture, by its SPECIFIC message ──────
        // One block, two case pairs, and a Verb table that lost a row. Both other
        // clauses are deliberately satisfied there, so this equality is the one
        // clause under test rather than "something went wrong".
        assertEquals(
            listOf(
                "blocks/ledger/Tools.kt — ledger declares 2 transport case(s) and holds 1 classified " +
                    "`Verb` row(s) — site 3 is one classified row per verb",
            ),
            rowOneViolations(trees.fixtureTree("violating", BLAST_FIXTURE), VERB_PACKAGE)
                .map { "${it.path} — ${it.message}" },
            "BLOCK-TEST: the violating fixture was ACCEPTED, or rejected for the wrong reason",
        )

        // ── ALLOW-TEST — the same block, respelled, must be silent ───────────
        // Its two rows are written through a STAR import and through an ALIASED
        // NESTED import: the two rebindings that defeat a text-matching clause.
        assertEquals(
            emptyList(),
            rowOneViolations(trees.fixtureTree("compliant", BLAST_FIXTURE), VERB_PACKAGE)
                .map { "${it.path} — ${it.message}" },
            "ALLOW-TEST: a compliant block, written in a legal spelling, was rejected (§15.2)",
        )
    }
}

/** The package the spine declares the verb union in. The census resolves against it
 *  and GateTest ties it back to the file that really holds `Verb`. */
private const val VERB_PACKAGE = "adr.spine.pure"

/** The fixture pair the blast-radius census is proven against, in both polarities. */
private const val BLAST_FIXTURE = "BLAST-RADIUS"
