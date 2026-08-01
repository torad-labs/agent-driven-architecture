import io.gitlab.arturbosch.detekt.Detekt
import java.io.ByteArrayOutputStream

// ── the ROOT project — the build's aggregator AND the gate's home ──────────
// Under ADR-001 §3's DAG the architecture lives in fourteen MODULES (settings.gradle.kts).
// This project is not one of them: it applies no `adr.*` convention plugin, and
// `adr.root`'s roster assertion excludes `:` by name. It owns two things.
//
// (1) THE GATE HARNESSES, at their existing paths. `src/test/kotlin/adr/gate/**` and
//     `src/test/fixtures/**` do NOT move, and that is a measured constraint rather
//     than convenience: the repository's `laws.toml` names `examples/kotlin` paths
//     including on-disk fixture PAIR paths, and the TypeScript gate RESOLVES each one
//     (`examples/typescript/test/laws/registry.ts`), so re-homing a fixture tree turns
//     the TypeScript suite red. Konsist reads the module roots by path
//     (GateTrees.MODULE_ROOTS) and detekt is given the same list below, so the gate
//     reads a fourteen-module tree without moving.
//
// (2) NOTHING ELSE. ADR-001 §9's Stages 2-4 have landed: the six block pairs hold
//     their own sources and `:app` holds the composition root, so this project's own
//     main source set compiles ZERO files. That emptiness is not asserted in prose and
//     it is not a leftover — `gateCompiledRootsAreGateRoots` below walks every Gradle
//     project in this build, THIS one included, and fails if any compiled Kotlin
//     source root holds a file the root list does not name. A `.kt` returning to
//     `src/main/kotlin` is caught there, by measurement, and was red-proven so.
//
//     The harness staying here is FORCED, not convenient:
//       * `adr.block` and `adr.spine` deny every external library outside the
//         toolchain on any classpath-feeding configuration, `testCompileClasspath`
//         included, so neither a block nor `:spine` can host `kotlin("test")`;
//       * `adr.spine`'s allowed project-edge set is EMPTY, while `spine/LoopTest.kt`
//         names five `adr.app.*` symbols and `adr/Support.kt` names three blocks plus
//         `adr.app` — one cross-cutting harness, not four module-local ones;
//       * `adr.root`'s inversion forbids `:` an adapter edge on ANY configuration.
//     Test edges onto `:spine`, every `:block:<x>` and `:app` are legal and are
//     declared below; the adapters reach the gate's classpath TRANSITIVELY through
//     `:app`'s own runtime, which is a resolved graph and not a declared edge.

plugins {
    kotlin("jvm") version "2.4.0"
    // The type-aware half of the gate (checks C3, C9, C14). See config/detekt/gate.yml.
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
}

dependencies {
    // THE ARCHITECTURE, as MODULES (ADR-001 §3), on the TEST classpath — because the
    // gate harness is the only code left in this project. `:spine`, the six blocks and
    // `:app` are the thirteen-minus-adapters set the root is allowed to name; each is
    // declared because `implementation` separation means `:app`'s own edges do not put
    // `adr.blocks.*` in front of a test's `import`.
    testImplementation(project(":spine"))
    listOf("triage", "escalation", "console", "artifact", "analysis", "inbox")
        .forEach { testImplementation(project(":block:$it")) }
    testImplementation(project(":app"))
    // NO `:block:<x>:adapter` EDGE MAY BE ADDED HERE, on any configuration: `adr.root`'s
    // inversion half two walks `rootProject.allprojects` — `:` included — and fails
    // configuration with "only :app may depend on an adapter leaf". Proven by adding one.

    // The agent-loop runtime and coroutines, named by the gate's own test sources
    // (`spine/LoopTest.kt` imports ai.torad providers; nine test files import
    // kotlinx.coroutines). They are `implementation` on `:spine` and on `:app`, which
    // deliberately keeps them off a downstream COMPILE classpath, so the test source
    // set declares its own.
    testImplementation("ai.torad:torad-aisdk:0.3.0-alpha01")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    testImplementation(kotlin("test"))
    // The registry-totality check (gate check C13) reflects over sealedSubclasses.
    testImplementation(kotlin("reflect"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    // The structural half of the gate (C1, C2, C4-C8, C10-C12). Konsist parses the
    // tree with the Kotlin compiler front-end and exposes imports, packages,
    // declarations, types and modifiers — so each rule is an assertion about the
    // CODE, never about its text.
    testImplementation("com.lemonappdev:konsist:0.17.3")
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
    // The architecture gate (src/test/kotlin/adr/gate) reads the source tree,
    // so pin the working directory to the project root.
    workingDir = project.projectDir

    // WHAT THIS TASK ACTUALLY READS, DECLARED — or Gradle cannot know when to
    // re-run it. The gate reads two trees from disk at RUNTIME: the live
    // sources it judges, and the fixture pairs that are its block- and
    // allow-tests. Neither is on `tasks.test`'s classpath, so neither was an
    // input, so on any warm build directory `:test` stayed UP-TO-DATE while a
    // fixture was edited or DELETED underneath it. A review measured the whole
    // konsist gate silently not running under plain `./gradlew check` — which
    // is the command both READMEs and the enforcement tables name as the gate.
    // That defeats the per-file denial map one layer up: a map cannot fail if
    // the test never executes. CI was never affected (a fresh checkout has no
    // build/), which is exactly why it survived until someone ran the local
    // command twice.
    inputs.dir("src/test/fixtures").withPathSensitivity(PathSensitivity.RELATIVE)
    inputs.files(
        fileTree(project.projectDir) {
            include("*/src/main/kotlin/**/*.kt", "*/*/src/main/kotlin/**/*.kt")
        },
    ).withPathSensitivity(PathSensitivity.RELATIVE)
}

// ── the gate (15.2) ────────────────────────────────────────────────────────
// 15.1 stakes the architecture's answer to its own central problem on MACHINE
// ENFORCEMENT, and 15.4 closes "the payoff the whole reference promises is
// contingent on these checks being present and blocking". The shipped reference
// had none: Date.now() inside a tool and an `fs` import in the domain both passed
// a clean build.
//
// Seventeen checks now DENY, in two halves that run under ONE command:
//
//   ./gradlew check
//     ├── test                    Konsist + JUnit — C1, C2, C4-C8, C10-C13,
//     │                           each with its own BLOCK-test and ALLOW-test
//     ├── detektMain              type-aware — C3, C9, C14 over the live tree
//     ├── gateDetektBlockTest     …the same three, proven to REJECT a violation
//     └── gateDetektAllowTest     …and proven to ACCEPT compliant code
//
// There is no warning tier, no baseline file, and no `ignoreFailures` on any task
// that defends the live tree.

/**
 * Where the architecture's own sources live, one entry per source-bearing Gradle
 * module (ADR-001 §3). Konsist reads the same roots with `/adr` appended; keep the
 * two in step — GateTest fails loudly if they drift.
 */
val adrModuleSourceRoots = listOf(
    "spine/src/main/kotlin",
    "block/analysis/src/main/kotlin",
    "block/analysis/adapter/src/main/kotlin",
    "block/artifact/src/main/kotlin",
    "block/artifact/adapter/src/main/kotlin",
    "block/console/src/main/kotlin",
    "block/escalation/src/main/kotlin",
    "block/escalation/adapter/src/main/kotlin",
    "block/inbox/src/main/kotlin",
    "block/triage/src/main/kotlin",
    "app/src/main/kotlin",
)

/**
 * FAIL LOUDLY, never quietly. Each root must exist AND hold Kotlin, or the analysis
 * below is reading part of the tree while reporting on all of it.
 */
val gateSourceRootsPresent by tasks.registering {
    description = "Proves every ADR module source root the gate analyses exists and is non-empty."
    outputs.upToDateWhen { false }
    val roots = adrModuleSourceRoots.map { it to layout.projectDirectory.dir(it).asFile }
    doLast {
        roots.forEach { (name, dir) ->
            val kt = dir.walkTopDown().filter { it.isFile && it.extension == "kt" }.count()
            check(kt > 0) {
                "gate source root `$name` holds $kt Kotlin files. detekt would report a clean " +
                    "tree it never read — see ADR-001 §3's module roots."
            }
        }
        logger.lifecycle("gate source roots: ${roots.map { it.first }} — all present and non-empty.")
    }
}

/**
 * WALL A — EVERY COMPILED KOTLIN MAIN SOURCE ROOT MUST BE A ROOT THE GATE READS.
 *
 * [gateSourceRootsPresent] above owns one direction: every LISTED root exists and holds
 * Kotlin. This is the converse, and without it the list is unfalsifiable from the other
 * side — a `.kt` under a compiled root nobody listed is compiled, jarred and shipped
 * while konsist, detekt and every roster below read straight past it. That is the same
 * vacuity class this repository was already bitten by at check C7, moved from the rules
 * to the TREE by ADR-001 §9's Stages 2-4: before them one directory held everything and
 * could not be missed; after them there are fourteen projects to hide under.
 *
 * DERIVED FROM `sourceSets`, NEVER FROM A HARD-CODED `<projectDir>/src/main/kotlin`, and
 * that is measured rather than stylistic: kotlin-jvm's MAIN KOTLIN source set also carries
 * `src/main/java`, and a `.kt` placed there compiles — `:block:console:compileKotlin`
 * emits class files for it. A hardcoded path is green on that file; this is red.
 *
 * `rootProject.allprojects` rather than the fourteen declared module directories, also
 * measured: `:` is not one of the fourteen, it still has a `main` source set, and a file
 * at `src/main/kotlin/` still compiles into `build/classes/kotlin/main`. The strictest
 * escape is the one the module list cannot see.
 *
 * A directory COUNTS only when it exists AND holds at least one `.kt` at any depth, which
 * is what keeps the three IO-less adapter modules legally source-free — and fail-closed
 * the instant a file lands in one — with no relaxation of [gateSourceRootsPresent].
 *
 * Captured under `projectsEvaluated` because a source set exists only after the owning
 * project has been configured; asserted in `doLast` over the captured value, so no task
 * reaches across a project boundary at execution time.
 */
val gateCompiledRoots = mutableListOf<File>()

gradle.projectsEvaluated {
    rootProject.allprojects.forEach { owner ->
        val main = owner.extensions
            .findByType(SourceSetContainer::class.java)
            ?.findByName("main")
            ?: return@forEach
        val srcDirs = (main.extensions.findByName("kotlin") as? SourceDirectorySet)?.srcDirs
            ?: main.java.srcDirs
        gateCompiledRoots += srcDirs
    }
}

val gateCompiledRootsAreGateRoots by tasks.registering {
    description = "Proves every compiled Kotlin main source root holding a file is a gate root."
    outputs.upToDateWhen { false }
    val listed = adrModuleSourceRoots.map { layout.projectDirectory.dir(it).asFile.canonicalFile }
    val rootDir = layout.projectDirectory.asFile
    val compiledRoots = gateCompiledRoots
    doLast {
        val compiled = compiledRoots
            .filter { dir ->
                dir.isDirectory &&
                    dir.walkTopDown().any { it.isFile && it.extension == "kt" }
            }
            .map { it.canonicalFile }
            .toSortedSet()
        val unread = (compiled - listed.toSet()).map {
            it.relativeTo(rootDir.canonicalFile).invariantSeparatorsPath
        }
        check(unread.isEmpty()) {
            "COMPILED BUT UNREAD: ${unread.sorted().joinToString(", ")}. Kotlin under these roots " +
                "is compiled and shipped, and no gate reads it — add each to " +
                "`adrModuleSourceRoots` here and to `GateTrees.MODULE_ROOTS` (with `/adr`), " +
                "or stop compiling it."
        }
        logger.lifecycle("gate compiled roots: ${compiled.size} compiled, all listed.")
    }
}

/**
 * WALL B — NO SOURCE ESCAPES THE `adr/` PACKAGE DIRECTORY.
 *
 * The two root lists are deliberately spelled one segment apart: `GateTrees.MODULE_ROOTS`
 * entries end `/adr`, `adrModuleSourceRoots` entries stop at `src/main/kotlin`. So per
 * listed module there is exactly one directory detekt reads and konsist does not — the
 * root itself — and the module split multiplied that gap from one site to eleven.
 * A file dropped beside `adr/` rather than under it is invisible to all eleven konsist
 * checks and to every roster in GateTest, while wall A stays correctly silent because the
 * root IS listed. Kotlin does not require directory to match package, so the escape needs
 * no unusual spelling: `package adr.blocks.console` in `block/console/src/main/kotlin/`
 * compiles.
 *
 * Comparison is on `invariantSeparatorsPath` so the rule holds on any separator.
 */
val gateNoSourceOutsideAdr by tasks.registering {
    description = "Proves every Kotlin file under a gate root sits inside that root's adr/ package."
    outputs.upToDateWhen { false }
    val roots = adrModuleSourceRoots.map { it to layout.projectDirectory.dir(it).asFile }
    doLast {
        val stray = roots.flatMap { (name, dir) ->
            if (!dir.isDirectory) {
                emptyList()
            } else {
                dir.walkTopDown()
                    .filter { it.isFile && it.extension == "kt" }
                    .filterNot { it.invariantSeparatorsPath.startsWith(dir.invariantSeparatorsPath + "/adr/") }
                    .map { "$name/${it.relativeTo(dir).invariantSeparatorsPath}" }
                    .toList()
            }
        }
        check(stray.isEmpty()) {
            "SOURCE OUTSIDE adr/: ${stray.sorted().joinToString(", ")}. Konsist reads " +
                "`<root>/adr` and normalises on it, so a file beside that directory is compiled " +
                "and read by no structural check. Move it under the root's `adr/` tree."
        }
        logger.lifecycle("gate adr/ containment: ${roots.size} roots, no source outside adr/.")
    }
}

detekt {
    // The gate IS config/detekt/gate.yml. Nothing is inherited, so no rule can
    // arrive unreviewed and no author is ever asked to silence one (15.2).
    buildUponDefaultConfig = false
    allRules = false
    config.setFrom(files("config/detekt/gate.yml"))
    ignoreFailures = false
    // The tree the gate defends. §1.3's import table is about spine/, blocks/ and
    // app/; the fixtures under src/test/fixtures are analysed by their own tasks,
    // with the assertion inverted.
    //
    // Under §3's DAG that tree is spread over MODULE ROOTS, so the source set is
    // derived from the list above rather than hard-coded to this project's own
    // src/main/kotlin. A module whose sources landed outside the list would be
    // silently un-analysed by C3/C9/C14 — 43 files' worth, in the case of :spine —
    // which is the vacuity class this repository has already been bitten by once
    // (C7's derivation). GateTest's MODULE ROOTS test asserts this list and Konsist's
    // GateTrees.MODULE_ROOTS name the same roots, from the other side.
    source.setFrom(files(adrModuleSourceRoots))
}

/** Fixture pairs live outside every compiled source set: they are input, not code. */
val gateFixtures = layout.projectDirectory.dir("src/test/fixtures/detekt")

/**
 * Type resolution needs the classpath the compiler saw. Without it,
 * ElseCaseInsteadOfExhaustiveWhen cannot tell a sealed subject from any other and
 * ForbiddenMethodCall cannot resolve a call at all — both would silently pass, and
 * a silently-passing check is the exact failure the review measured (15.2).
 */
val gateAnalysisClasspath: FileCollection = files(
    configurations.named("detekt"),
    // THE WHOLE DAG'S OUTPUT, from the one configuration that resolves it.
    //
    // This project no longer compiles a main source set, so the pre-migration spelling
    // (`sourceSets.main.compileClasspath` + `.output`) would now hand detekt an EMPTY
    // classpath: C3 would stop resolving `System.currentTimeMillis`, C9 would stop
    // seeing a sealed subject, and the fixture compiles below would stop finding
    // `adr.spine.pure.Signature` — all of which fail SILENTLY as a clean report. The
    // block-tests below are what turn that into a red build, and they were run against
    // an emptied classpath to prove it.
    //
    // `testRuntimeClasspath` is used rather than a hand-built list because it is the
    // RESOLVED graph of §3's DAG as this project declares it — `:spine`, the six
    // blocks and `:app`, plus TRANSITIVELY, through `:app`'s own `implementation`
    // edges, the three adapter modules that C3/C9/C14 must be able to type-resolve.
    // Reaching an adapter any other way would mean DECLARING an adapter edge on `:`,
    // which `adr.root`'s inversion fails at configuration. A resolved graph is not a
    // declared dependency, which is exactly why this is the legal route and the
    // direct one is not.
    //
    // MEASURED WIDENING, recorded so it is not silently forgotten: this configuration
    // also carries konsist, junit-jupiter, kotlin-test-junit5 and coroutines-test, none
    // of which the old spelling carried. A fixture could therefore type-resolve a
    // TEST-ONLY symbol and still compile. Re-measured today across all 68 files under
    // `src/test/fixtures` — the blast-radius census's own pair is the newest six, and
    // the stated total had drifted from 52 before them: ZERO name any of them
    // (`grep -rE 'import (com\.lemonappdev|org\.junit|kotlin\.test|kotlinx\.coroutines\.test)'`
    // over that tree returns nothing). Re-run that grep before adding a fixture.
    configurations.named("testRuntimeClasspath"),
)

/**
 * Type resolution also needs the JDK. Without `jdkHome`, `System.currentTimeMillis()`
 * resolves to nothing at all and C3 passes silently on the very call it exists to
 * deny — which is why the block-test below is not optional.
 */
val gateJdkHome = javaToolchains
    .launcherFor { languageVersion.set(JavaLanguageVersion.of(21)) }
    .map { it.metadata.installationPath }

tasks.withType<Detekt>().configureEach {
    jvmTarget = "21"
    jdkHome.set(gateJdkHome)
    reports {
        xml.required.set(true)
        html.required.set(false)
        txt.required.set(false)
        sarif.required.set(false)
        md.required.set(false)
    }
}

/** The live tree. DENYING: a finding here fails the build. */
tasks.named<Detekt>("detektMain") {
    description = "C3/C9/C14 over the production tree. A finding is a failed build."
    classpath.setFrom(gateAnalysisClasspath)
    // MEASURED, not assumed: this task is created by the Kotlin plugin per SOURCE SET,
    // so it defaults to THIS project's src/main/kotlin and ignores the
    // `detekt { source }` block entirely. That default is now the EMPTY SET — Stages
    // 2-4 moved every main source into a module — so without this line detektMain would
    // report a clean tree having read zero files. It was two thirds of the tree before
    // the stages landed (an ambient `System.currentTimeMillis()` inside the :spine
    // module passed detektMain green while the plain `detekt` task caught it); it is
    // now ALL of it. Both denying tasks read the module roots.
    setSource(files(adrModuleSourceRoots))
}

/**
 * The plugin's own `detekt` task runs WITHOUT type resolution, and all three rules
 * need it — so left alone, `./gradlew detekt` would report a clean tree no matter
 * what the tree contained. A command that always says yes is worse than no command,
 * so it gets the same classpath as everything else here.
 *
 * Its source is narrowed to src/main (see the `detekt { }` block above). The gate
 * defends the PRODUCTION tree: §1.3's table is about spine/, blocks/ and app/, and
 * test code deliberately constructs stamps and refusals in order to assert on them
 * — GateTest's own G1 test builds a Signature and a Refused on purpose. Denying
 * that would be the nuisance 15.2 warns about, and the first thing an author would
 * switch off.
 */
tasks.named<Detekt>("detekt") {
    description = "C3/C9/C14 over the production tree, with type resolution."
    classpath.setFrom(gateAnalysisClasspath)
}

/**
 * The BLOCK-test half. Runs the same three rules over a tree that violates each
 * one on purpose. `ignoreFailures` is true HERE and only here, because the
 * assertion is INVERTED: gateDetektBlockTest fails unless every expected rule fired.
 */
val gateDetektViolating by tasks.registering(Detekt::class) {
    description = "Runs the gate's detekt rules over the deliberately violating fixtures."
    setSource(gateFixtures.dir("violating"))
    classpath.setFrom(gateAnalysisClasspath)
    config.setFrom(files("config/detekt/gate.yml"))
    buildUponDefaultConfig = false
    ignoreFailures = true
    reports.xml.outputLocation.set(layout.buildDirectory.file("reports/detekt/gate-violating.xml"))
}

/** The ALLOW-test half: the same shapes, written the way the architecture asks. */
val gateDetektCompliant by tasks.registering(Detekt::class) {
    description = "Runs the gate's detekt rules over the compliant fixtures."
    setSource(gateFixtures.dir("compliant"))
    classpath.setFrom(gateAnalysisClasspath)
    config.setFrom(files("config/detekt/gate.yml"))
    buildUponDefaultConfig = false
    ignoreFailures = true
    reports.xml.outputLocation.set(layout.buildDirectory.file("reports/detekt/gate-compliant.xml"))
}

/**
 * What each check must be seen REJECTING, keyed by the check it proves.
 *
 * Keyed on the finding itself, not on the rule id: C3, C4, C6 and C7 are all
 * carried by ForbiddenMethodCall, so asserting "ForbiddenMethodCall fired" would
 * let three of the four rot away unnoticed behind the fourth.
 */
val gateDetektExpected = mapOf(
    "C3 (ambient clock/random/id)" to "java.lang.System.currentTimeMillis",
    "C3 (ambient instant)" to "java.time.Instant.now",
    "C3 (ambient id)" to "java.util.UUID.randomUUID",
    "C3 (ambient random)" to "kotlin.random.Random.nextInt",
    "C4 (forged Signature)" to "adr.spine.pure.Signature.&lt;init&gt;",
    "C6 (block reaches RunStatus.Degraded)" to "adr.spine.pure.RunStatus.Degraded.&lt;init&gt;",
    "C6 (block reaches RunStatus.Error)" to "adr.spine.pure.RunStatus.Error.&lt;init&gt;",
    "C7 (result minted outside the boundary)" to "adr.contract.ToolResult.Refused.&lt;init&gt;",
    "C9 (else over a sealed subject)" to "source=\"detekt.ElseCaseInsteadOfExhaustiveWhen\"",
    "C14 (control flow in the loop)" to "source=\"detekt.CyclomaticComplexMethod\"",
    "suppression lock (a @Suppress of a gate rule)" to "source=\"detekt.ForbiddenSuppress\"",
)

val gateDetektBlockTest by tasks.registering {
    description = "BLOCK-TEST: proves C3, C9 and C14 REJECT their violating fixture."
    dependsOn(gateDetektViolating)
    val report = layout.buildDirectory.file("reports/detekt/gate-violating.xml")
    val expected = gateDetektExpected
    outputs.upToDateWhen { false }
    doLast {
        val xml = report.get().asFile.readText()
        val missing = expected.filterValues { !xml.contains(it) }
        check(missing.isEmpty()) {
            "gate BLOCK-TEST failed: the violating fixtures did NOT trip " +
                missing.entries.joinToString { "${it.key} (${it.value})" } +
                ". A check nobody has watched fail is not a check."
        }
    }
}

val gateDetektAllowTest by tasks.registering {
    description = "ALLOW-TEST: proves C3, C9 and C14 ACCEPT idiomatic compliant code."
    dependsOn(gateDetektCompliant)
    val report = layout.buildDirectory.file("reports/detekt/gate-compliant.xml")
    outputs.upToDateWhen { false }
    doLast {
        val xml = report.get().asFile.readText()
        val findings = Regex("""<error\b[^>]*>""").findAll(xml).map { it.value }.toList()
        check(findings.isEmpty()) {
            "gate ALLOW-TEST failed: the COMPLIANT fixtures were rejected by" +
                findings.joinToString("\n  ", prefix = "\n  ") +
                "\nA rule that fires on correct code is a nuisance authors turn off (15.2)."
        }
    }
}

// ── G12: the edit list, PROVEN by the compiler ─────────────────────────────
// §11.2 promises that adding a state variant costs 1 append plus 3 compiler-named
// arms, all inside one block folder. 15.4 lists that as a G12 self-check —
// "introduce a variant; the build must break at the fold arm, the view projection
// and the context projection" — and the review measured (G12) that the self-check had never
// been run: `t.status.kind === "Open"` is not a closed match, and it compiles
// happily after a variant is added while silently answering the wrong thing.
//
// So the reference stops asserting the edit list and starts EARNING it. Two
// checked-in fixture trees hold a faithful copy of the three consumers against the
// real spine vocabulary. The block-test compiles the five-variant tree and demands
// a non-zero exit naming all three sites; the allow-test compiles the four-variant
// tree and demands exit 0. Both run under `./gradlew check`.
//
// A SECOND PAIR RIDES THE SAME HARNESS since effect performance became registrable
// per block: `src/test/fixtures/effect-kind`, where the appended variant is a NOVEL
// EFFECT KIND and the ONE compiler-named site is the owning block's own performer.
//
// EACH FIXTURE DIRECTORY IS A MULTI-FILE COMPILATION UNIT, and that is what makes the
// "and nowhere else" guard below able to fail at all. One .kt file per directory would
// leave `elsewhere` — the set of NAMED files other than the expected one — empty by
// construction, i.e. a wall that cannot fire. So each effect-kind polarity also ships
// a stand-in composition root written in the POST-split idiom: it holds a performer and
// names no effect kind. Rewrite that root in the PRE-split idiom (an exhaustive `when`
// over the demo union) and the block-test goes red naming `Root.kt` — red-proven, and
// that is the reversal the pair keeps as a measured fact rather than a claim.

val kotlinCompilerCli: Configuration by configurations.creating

dependencies {
    kotlinCompilerCli("org.jetbrains.kotlin:kotlin-compiler-embeddable:2.4.0")
}

/**
 * Compile one fixture tree with the real Kotlin compiler, against the real
 * compiled spine. [expectFailure] inverts the assertion; [mustName] is what the
 * compiler has to have said, so a build that fails for some UNRELATED reason
 * cannot masquerade as a passing block-test.
 */
fun registerExhaustiveCheck(
    taskName: String,
    fixtureRoot: String,
    fixture: String,
    expectFailure: Boolean,
    claim: String,
    mustName: List<String> = emptyList(),
    sitesIn: String = "",
    expectSites: Int = 0,
) = tasks.register<JavaExec>(taskName) {
    // The classpath spans ELEVEN module boundaries now, and it is consumed from an
    // argumentProvider — which carries no task dependency of its own. Without this the
    // compiler would be handed paths to module output nothing had built yet. The old
    // `dependsOn(compileKotlin)` beside it is gone with the root's main source set: it
    // named a task that now compiles zero files, so it guaranteed nothing.
    dependsOn(gateAnalysisClasspath)
    val source = layout.projectDirectory.dir("src/test/fixtures/$fixtureRoot").dir(fixture)
    val outDir = layout.buildDirectory.dir("gate/$fixtureRoot/$fixture")
    val logFile = layout.buildDirectory.file("reports/gate/$fixtureRoot-$fixture.txt")

    description = if (expectFailure) "G12 BLOCK-TEST: $claim" else "G12 ALLOW-TEST: $claim"

    classpath = kotlinCompilerCli
    mainClass.set("org.jetbrains.kotlin.cli.jvm.K2JVMCompiler")
    isIgnoreExitValue = true
    outputs.upToDateWhen { false }

    val captured = ByteArrayOutputStream()
    standardOutput = captured
    errorOutput = captured

    argumentProviders.add {
        listOf(
            "-no-stdlib",
            "-jvm-target", "21",
            "-classpath", gateAnalysisClasspath.filter { it.exists() }.asPath,
            "-d", outDir.get().asFile.absolutePath,
            source.asFile.absolutePath,
        )
    }

    doLast {
        val log = captured.toString()
        logFile.get().asFile.apply { parentFile.mkdirs() }.writeText(log)
        val exit = executionResult.get().exitValue

        if (expectFailure) {
            check(exit != 0) {
                "G12 BLOCK-TEST failed: adding a fifth TicketStatus variant COMPILED.\n" +
                    "The edit list §11.2 promises is not real, which is exactly what the review measured (G12).\n$log"
            }
            val missing = mustName.filterNot { log.contains(it) }
            check(missing.isEmpty()) {
                "G12 BLOCK-TEST failed: the build broke, but not for the expected reason.\n" +
                    "The compiler never said: $missing\n$log"
            }
            // Count the EXHAUSTIVENESS errors specifically. The compiler also emits
            // knock-on type errors from the same three sites, and counting those too
            // would make K look like whatever the inference cascade happened to
            // produce rather than the number §11.2 actually claims.
            val sites = Regex(
                Regex.escape(sitesIn) + """:(\d+):\d+: error: 'when' expression must be exhaustive""",
            )
                .findAll(log)
                .map { it.groupValues[1] }
                .toSet()
            check(sites.size == expectSites) {
                "G12 BLOCK-TEST failed: expected $expectSites compiler-named site(s) in " +
                    "$sitesIn, got ${sites.size} at lines $sites. The claim under test: " +
                    "$claim\n$log"
            }
            // …AND NOWHERE ELSE. A count that only looks at the expected file passes just
            // as happily when the append also broke the stand-in composition root, which
            // is the exact number this pair exists to measure. Each fixture directory is
            // MULTI-FILE precisely so this set can be non-empty.
            val elsewhere = Regex("""([A-Za-z]+\.kt):\d+:\d+: error:""")
                .findAll(log)
                .map { it.groupValues[1] }
                .filterNot { it == sitesIn }
                .toSet()
            check(elsewhere.isEmpty()) {
                "G12 BLOCK-TEST failed: the compiler also named $elsewhere. The claim is " +
                    "that $sitesIn is the WHOLE edit list.\n$log"
            }
            logger.lifecycle(
                "G12 BLOCK-TEST: the compiler named $expectSites site(s) in $sitesIn " +
                    "(lines ${sites.sorted()}) and nothing else — edit list earned.",
            )
        } else {
            check(exit == 0) {
                "G12 ALLOW-TEST failed: the compliant four-variant tree did NOT compile.\n" +
                    "A negative-compilation fixture that never compiles proves nothing.\n$log"
            }
        }
    }
}

val gateExhaustiveBlockTest = registerExhaustiveCheck(
    taskName = "gateExhaustiveBlockTest",
    fixtureRoot = "exhaustive",
    fixture = "violating",
    expectFailure = true,
    claim = "a fifth TicketStatus variant must BREAK the build at three sites, all in the block.",
    mustName = listOf("'when' expression must be exhaustive"),
    sitesIn = "Escalation.kt",
    expectSites = 3,
)

val gateExhaustiveAllowTest = registerExhaustiveCheck(
    taskName = "gateExhaustiveAllowTest",
    fixtureRoot = "exhaustive",
    fixture = "compliant",
    expectFailure = false,
    claim = "the same three consumers must compile cleanly at four variants.",
)

val gateEffectKindBlockTest = registerExhaustiveCheck(
    taskName = "gateEffectKindBlockTest",
    fixtureRoot = "effect-kind",
    fixture = "violating",
    expectFailure = true,
    claim = "a NOVEL EFFECT KIND must break the build at ONE site — the block's own performer.",
    mustName = listOf("'when' expression must be exhaustive"),
    sitesIn = "EffectKind.kt",
    expectSites = 1,
)

val gateEffectKindAllowTest = registerExhaustiveCheck(
    taskName = "gateEffectKindAllowTest",
    fixtureRoot = "effect-kind",
    fixture = "compliant",
    expectFailure = false,
    claim = "the same performer and stand-in root must compile cleanly at one kind.",
)

/**
 * WALL C — THE GATE HARNESS IS THE ONLY TEST SOURCE TREE.
 *
 * `GateTrees.testTree()` reads ONE root, the root project's own `src/test/kotlin`, and
 * every ledger census in GateTest is derived from it. A module that grows a test source
 * set of its own is therefore compiled, shipped and read by no structural check — an
 * out-of-folder ledger written there defeats an equality census while the whole gate
 * stays BUILD SUCCESSFUL (adversarial review built exactly that, in `:app`).
 *
 * The root project is skipped because the root IS the harness: pure modules cannot hold
 * a test framework at all (`adr.block`/`adr.spine` deny an external library on
 * testCompileClasspath), which is what forces every test to live in one place and is
 * what makes this wall's rule the honest statement of the structure rather than a
 * restriction on it.
 *
 * Captured under `projectsEvaluated` and asserted in `doLast`, exactly like wall A.
 */
val gateModuleTestRoots = mutableListOf<Pair<String, File>>()

gradle.projectsEvaluated {
    rootProject.allprojects.forEach { owner ->
        if (owner == rootProject) return@forEach
        val test = owner.extensions
            .findByType(SourceSetContainer::class.java)
            ?.findByName("test")
            ?: return@forEach
        val srcDirs = (test.extensions.findByName("kotlin") as? SourceDirectorySet)?.srcDirs
            ?: test.java.srcDirs
        srcDirs.forEach { gateModuleTestRoots += owner.path to it }
    }
}

val gateNoModuleTestSources by tasks.registering {
    description = "Proves the gate harness is the ONLY test source tree — GateTrees.testTree() reads one root."
    outputs.upToDateWhen { false }
    val captured = gateModuleTestRoots
    doLast {
        val stray = captured
            .filter { (_, dir) ->
                dir.isDirectory && dir.walkTopDown().any { it.isFile && it.extension == "kt" }
            }
            .map { (path, dir) -> "$path -> ${dir.invariantSeparatorsPath}" }
        check(stray.isEmpty()) {
            "TEST SOURCE OUTSIDE THE HARNESS: ${stray.sorted().joinToString(", ")}. " +
                "`GateTrees.testTree()` reads the root project's test tree and nothing else, so " +
                "Kotlin under these roots is compiled and read by no structural check. Move it " +
                "into the root harness, or teach the harness to read it."
        }
        logger.lifecycle("gate test roots: harness only, ${captured.size} module test root(s) all empty.")
    }
}

tasks.check {
    dependsOn(
        gateSourceRootsPresent,
        gateCompiledRootsAreGateRoots,
        gateNoSourceOutsideAdr,
        gateNoModuleTestSources,
        tasks.named("detektMain"),
        gateDetektBlockTest,
        gateDetektAllowTest,
        gateExhaustiveBlockTest,
        gateExhaustiveAllowTest,
        gateEffectKindBlockTest,
        gateEffectKindAllowTest,
    )
}

