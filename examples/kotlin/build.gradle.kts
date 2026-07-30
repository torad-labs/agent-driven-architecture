import io.gitlab.arturbosch.detekt.Detekt
import java.io.ByteArrayOutputStream

// ── the ROOT project — the build's aggregator AND the gate's home ──────────
// Under ADR-001 §3's DAG the architecture lives in fourteen MODULES (settings.gradle.kts).
// This project is not one of them: it applies no `adr.*` convention plugin, and
// `adr.root`'s roster assertion excludes `:` by name. It owns two things.
//
// (1) THE GATE HARNESSES, at their existing paths. `src/test/kotlin/adr/gate/**` and
//     `src/test/fixtures/**` do NOT move, and that is a measured constraint rather
//     than convenience: the repository's `laws.toml` names 36 `examples/kotlin` paths
//     including on-disk fixture PAIR paths, and the TypeScript gate RESOLVES each one
//     (`examples/typescript/test/laws/registry.ts`), so re-homing a fixture tree turns
//     the TypeScript suite red. Konsist reads the module roots by path
//     (GateTrees.MODULE_ROOTS) and detekt is given the same list below, so the gate
//     reads a fourteen-module tree without moving.
//
// (2) The source not yet migrated. ADR-001 §9 stages the move: `:spine` is extracted
//     in this stage, the six block pairs in stages 2-3, `:app` in stage 4. Until a
//     module's files arrive, they compile here against `project(":spine")`.

plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.serialization") version "2.4.0"
    application
    // The type-aware half of the gate (checks C3, C9, C14). See config/detekt/gate.yml.
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
}

dependencies {
    // THE KERNEL, now a module (ADR-001 §3). Everything still living in this project —
    // the blocks, the root wiring, and the whole gate harness — compiles against it
    // across a real module edge.
    implementation(project(":spine"))

    // The agent-loop runtime: Marcos's aisdk-kotlin (the architecture sits on top of it).
    implementation("ai.torad:torad-aisdk:0.3.0-alpha01")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

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

application {
    mainClass.set("adr.app.MainKt")
}

tasks.test {
    useJUnitPlatform()
    // The architecture gate (src/test/kotlin/adr/gate) reads the source tree,
    // so pin the working directory to the project root.
    workingDir = project.projectDir
}

// ── the gate (15.2) ────────────────────────────────────────────────────────
// 15.1 stakes the architecture's answer to its own central problem on MACHINE
// ENFORCEMENT, and 15.4 closes "the payoff the whole reference promises is
// contingent on these checks being present and blocking". The shipped reference
// had none: Date.now() inside a tool and an `fs` import in the domain both passed
// a clean build.
//
// Fourteen checks now DENY, in two halves that run under ONE command:
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
val adrModuleSourceRoots = listOf("spine/src/main/kotlin", "src/main/kotlin")

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
    // Under §3's DAG this is where `:spine`'s compiled output arrives — across a real
    // module edge, as `project(":spine")`'s artifact. Everything the fixtures name
    // from the kernel (`adr.spine.pure.Signature`, `adr.contract.ToolResult.Refused`,
    // `adr.spine.pure.RunStatus.Degraded`) resolves through here and nowhere else, so
    // dropping it makes gateDetektBlockTest and gateExhaustiveBlockTest go red rather
    // than quietly pass — proven by removing it.
    sourceSets.main.get().compileClasspath,
    // The compiled tree itself, so the FIXTURES can name the real transport types.
    // A fixture that constructs its own local `Signature` would prove nothing: the
    // rules match resolved constructors, so the fixture has to reach the same one
    // the architecture is protecting.
    sourceSets.main.get().output,
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
    // so it reads THIS project's src/main/kotlin and ignores the `detekt { source }`
    // block entirely. Under §3's DAG that is two thirds of the tree — an ambient
    // `System.currentTimeMillis()` inside the :spine module passed detektMain green
    // while the plain `detekt` task caught it. Both denying tasks read the module roots.
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

val kotlinCompilerCli: Configuration by configurations.creating

dependencies {
    kotlinCompilerCli("org.jetbrains.kotlin:kotlin-compiler-embeddable:2.4.0")
}

val exhaustiveFixtures = layout.projectDirectory.dir("src/test/fixtures/exhaustive")

/**
 * Compile one fixture tree with the real Kotlin compiler, against the real
 * compiled spine. [expectFailure] inverts the assertion; [mustName] is what the
 * compiler has to have said, so a build that fails for some UNRELATED reason
 * cannot masquerade as a passing block-test.
 */
fun registerExhaustiveCheck(
    taskName: String,
    fixture: String,
    expectFailure: Boolean,
    mustName: List<String> = emptyList(),
) = tasks.register<JavaExec>(taskName) {
    dependsOn(tasks.named("compileKotlin"))
    // The classpath now spans module boundaries, and it is consumed from an
    // argumentProvider — which carries no task dependency of its own. Without this the
    // compiler would be handed a path to `:spine` output nothing had built yet.
    dependsOn(gateAnalysisClasspath)
    val source = exhaustiveFixtures.dir(fixture)
    val outDir = layout.buildDirectory.dir("gate/exhaustive/$fixture")
    val logFile = layout.buildDirectory.file("reports/gate/exhaustive-$fixture.txt")

    description = if (expectFailure) {
        "G12 BLOCK-TEST: a fifth TicketStatus variant must BREAK the build at three sites."
    } else {
        "G12 ALLOW-TEST: the same three consumers must compile cleanly at four variants."
    }

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
            val sites = Regex("""Escalation\.kt:(\d+):\d+: error: 'when' expression must be exhaustive""")
                .findAll(log)
                .map { it.groupValues[1] }
                .toSet()
            check(sites.size == 3) {
                "G12 BLOCK-TEST failed: expected THREE compiler-named sites, got ${sites.size} " +
                    "at lines $sites. §11.2's K = 3 is the claim under test.\n$log"
            }
            logger.lifecycle("G12 BLOCK-TEST: the compiler named 3 sites (lines ${sites.sorted()}) — edit list earned.")
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
    fixture = "violating",
    expectFailure = true,
    mustName = listOf("'when' expression must be exhaustive"),
)

val gateExhaustiveAllowTest = registerExhaustiveCheck(
    taskName = "gateExhaustiveAllowTest",
    fixture = "compliant",
    expectFailure = false,
)

tasks.check {
    dependsOn(
        gateSourceRootsPresent,
        tasks.named("detektMain"),
        gateDetektBlockTest,
        gateDetektAllowTest,
        gateExhaustiveBlockTest,
        gateExhaustiveAllowTest,
    )
}

