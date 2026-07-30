// ── build-logic/AdrDag — ADR-001 §3's dependency law, as build code ────────
//
// §3's forbidden edges are rejected "at configuration, before a line compiles".
// This file holds the two mechanisms every adr.* plugin below composes, plus the
// module set and the MEASURED allow-sets they police.
//
// WHY THE FORM AND NOT THE NAME. ADR-001:368-386 pastes a rejection snippet that
// loops over four configuration NAMES — "api", "implementation", "compileOnly",
// "runtimeOnly" — and reads `configuration.dependencies`. Both halves are holes,
// and all four were measured open on this repository's Gradle 9 wrapper, before this
// file was written: `testImplementation(project(sibling))` passes,
// `add("annotationProcessor", project(sibling))` passes, and a custom configuration
// that `implementation.extendsFrom(...)` carries the sibling passes AND puts it on
// the real compileClasspath. `.dependencies` also cannot see an inherited dependency at
// all. So the ban walks EVERY configuration and reads `allDependencies`: what is
// denied is the FORM (a ProjectDependency outside the allow-set), never a spelling.
// The ADR's snippet is a snippet; amending its text is the owner's call and is
// reported by the item that landed this file.

import org.gradle.api.Project
import org.gradle.api.artifacts.Configuration
import org.gradle.api.artifacts.ExternalModuleDependency
import org.gradle.api.artifacts.ProjectDependency
import org.gradle.api.artifacts.component.ModuleComponentIdentifier

/** The six blocks ADR-001 §3 names. */
val ADR_BLOCKS: List<String> = listOf("triage", "escalation", "console", "artifact", "analysis", "inbox")

/**
 * The FOURTEEN declared modules — ADR-001 §5's adapter leaf, a pair per block,
 * unconditional. The implicit `:block` container and the root `:` are NOT modules and
 * are excluded by name wherever this list is compared against `allprojects`.
 */
val ADR_MODULES: List<String> =
    listOf(":spine") + ADR_BLOCKS.flatMap { listOf(":block:$it", ":block:$it:adapter") } + listOf(":app")

/** Gradle projects that exist but are not modules: the root, and `include`'s container. */
val ADR_NON_MODULES: Set<String> = setOf(":", ":block")

/**
 * What the Kotlin JVM plugin puts on a module's classpath on its own. A pure module
 * gets this and nothing else, so it is part of every allow-set rather than an
 * exception to one.
 */
val KOTLIN_TOOLCHAIN_COORDS: Set<String> = setOf(
    "org.jetbrains.kotlin:kotlin-stdlib",
    "org.jetbrains.kotlin:kotlin-stdlib-jdk7",
    "org.jetbrains.kotlin:kotlin-stdlib-jdk8",
    "org.jetbrains.kotlin:kotlin-stdlib-common",
    "org.jetbrains.kotlin:kotlin-reflect",
    "org.jetbrains:annotations",
)

/**
 * `:spine`'s external allow-set, MEASURED against the module rather than guessed.
 *
 * ADR-001 §3 and §4 word `:spine` as "PURE JVM — no IO on the classpath". The tree
 * refutes the prose: `ai.torad:torad-aisdk` is a declared dependency and
 * `spine/agent/Loop.kt` imports six symbols from it (G3 confines the runtime to that
 * one file), spine/concurrency and `spine/pure/Mailbox.kt` import
 * kotlinx.coroutines, and `spine/pure/Action.kt` imports kotlinx.serialization.json.
 * So the honest ban on `:spine` is this MEASURED set, and file-level confinement
 * stays where it already lives — C1's runtime clause and C8's pure-ring clause.
 * The ADR's prose needs an owner amendment; the plugin ships the measurement.
 */
val SPINE_EXTERNAL_ALLOWED: Set<String> = KOTLIN_TOOLCHAIN_COORDS + setOf(
    "ai.torad:torad-aisdk",
    "org.jetbrains.kotlinx:kotlinx-coroutines-core",
    "org.jetbrains.kotlinx:kotlinx-serialization-json",
)

/**
 * A pure `:block:<x>`'s external allow-set: the Kotlin toolchain only.
 *
 * MEASURED, and it is a zero: `grep -rn 'import kotlinx' src/main/kotlin/adr/blocks/`
 * returns 0 while the same grep over the spine returns 20, and no block file imports
 * `ai.torad` either. An allow-set that admitted kotlinx onto a pure block would
 * admit exactly what C8 (Rules.kt:236-239) calls impure, on the strength of a
 * justification the tree does not contain.
 */
val BLOCK_EXTERNAL_ALLOWED: Set<String> = KOTLIN_TOOLCHAIN_COORDS

/**
 * The MEASURED runtime closure of a pure module — the TRANSITIVE half of §3's IO law.
 *
 * A declared-dependency ban at configuration time cannot see a library that arrives
 * through `:spine`. Measured, the COMPILE side of that hole does not exist: Java
 * library separation keeps an `implementation` dependency of `:spine` off a block's
 * compileClasspath entirely (with okhttp declared `implementation` on `:spine`,
 * `:block:<x>:dependencies` on compileClasspath prints `project :spine` and nothing
 * else), so a test for it would be unfalsifiable. The RUNTIME side is real — the same
 * command against runtimeClasspath prints okhttp — so the assertion lives there,
 * frozen over a measured coordinate set the same way `.api` freezes a surface.
 * Coordinates carry no version, so a version bump is not a false red.
 */
val PURE_RUNTIME_INTENDED: Set<String> = SPINE_EXTERNAL_ALLOWED + setOf(
    "org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm",
    "org.jetbrains.kotlinx:kotlinx-serialization-json-jvm",
    "org.jetbrains.kotlinx:kotlinx-serialization-core",
    "org.jetbrains.kotlinx:kotlinx-serialization-core-jvm",
    "org.jetbrains.kotlinx:kotlinx-serialization-bom",
    "org.jetbrains.kotlinx:kotlinx-coroutines-bom",
)

/**
 * NAMED RESIDUE, measured rather than tolerated silently.
 *
 * `ai.torad:torad-aisdk` is an HTTP client at bottom, and it drags a full ktor +
 * slf4j + kotlinx-io stack onto the RUNTIME classpath of every module downstream of
 * `:spine` — twenty-nine coordinates, listed here because the alternative is a check
 * that quietly says a pure block may hold ktor. It is on the runtime classpath only;
 * `implementation` keeps every one of them off a block's COMPILE classpath, so no
 * block file can import one and C8 still denies the imports that matter.
 *
 * WHAT THIS ASKS THE OWNER, and does not decide: G3 already confines the agent runtime
 * to `spine/agent/Loop.kt`, so the structure that would empty this set is a `:spine`
 * split — an agent leaf holding `ai.torad`, with the pure kernel depending on neither.
 * ADR-001 §3 declares `:spine` as ONE module, so that is a design fork on a ratified
 * document and belongs to its owner, not to the builder landing the DAG. Frozen here
 * so the assertion above still fails closed on anything NEW: a version bump that
 * starts dragging okhttp in trips it, which is exactly the case a declared-dependency
 * ban cannot see.
 */
val PURE_RUNTIME_MEASURED_RESIDUE: Set<String> = setOf(
    "ai.torad:torad-aisdk-jvm",
    "io.ktor:ktor-client-core",
    "io.ktor:ktor-client-core-jvm",
    "io.ktor:ktor-events",
    "io.ktor:ktor-events-jvm",
    "io.ktor:ktor-http",
    "io.ktor:ktor-http-cio",
    "io.ktor:ktor-http-cio-jvm",
    "io.ktor:ktor-http-jvm",
    "io.ktor:ktor-io",
    "io.ktor:ktor-io-jvm",
    "io.ktor:ktor-network",
    "io.ktor:ktor-network-jvm",
    "io.ktor:ktor-serialization",
    "io.ktor:ktor-serialization-jvm",
    "io.ktor:ktor-sse",
    "io.ktor:ktor-sse-jvm",
    "io.ktor:ktor-utils",
    "io.ktor:ktor-utils-jvm",
    "io.ktor:ktor-websocket-serialization",
    "io.ktor:ktor-websocket-serialization-jvm",
    "io.ktor:ktor-websockets",
    "io.ktor:ktor-websockets-jvm",
    "org.jetbrains.kotlinx:kotlinx-coroutines-slf4j",
    "org.jetbrains.kotlinx:kotlinx-io-bytestring",
    "org.jetbrains.kotlinx:kotlinx-io-bytestring-jvm",
    "org.jetbrains.kotlinx:kotlinx-io-core",
    "org.jetbrains.kotlinx:kotlinx-io-core-jvm",
    "org.slf4j:slf4j-api",
)

/** What may reach a pure module's runtime today: the intended set plus the named residue. */
val PURE_RUNTIME_ALLOWED: Set<String> = PURE_RUNTIME_INTENDED + PURE_RUNTIME_MEASURED_RESIDUE

/**
 * §3's project-edge law for one module: any [ProjectDependency] outside [allowed],
 * on ANY configuration, declared or inherited, fails configuration.
 */
class AdrDagLaw(private val project: Project) {

    fun denyProjectEdgesExcept(plugin: String, allowed: Set<String>, note: String) {
        project.afterEvaluate {
            project.configurations.forEach { cfg ->
            cfg.allDependencies.filterIsInstance<ProjectDependency>().forEach { dep ->
                    check(dep.path in allowed) {
                        "$plugin: ${project.path} may depend on $note — found ${dep.path} " +
                            "on configuration '${cfg.name}'."
                    }
                }
            }
        }
    }

/**
 * EVERY configuration that feeds this module's OWN classpath, DERIVED from the
 * `extendsFrom` graph rather than from a list of names.
 *
 * "On the classpath" is what §3's IO law is about, and a dependency reaches a
 * module's classpath if and only if it is declared on one of the four sinks below or
 * on something one of them extends — which is precisely the transitive closure walked
 * here. `implementation`, `api`, `compileOnly`, `runtimeOnly`, `testImplementation`
 * and any CUSTOM configuration an author makes `implementation.extendsFrom(...)` all
 * arrive automatically; nothing has to be enumerated, so nothing can be forgotten.
 *
 * What this deliberately does NOT police, and why the alternative is not an option:
 * the Kotlin plugin's own TOOL classpaths — `kotlinAbiValidationCompatClasspath`,
 * `kotlinCompilerPluginClasspath`, `kotlinBuildToolsApiClasspath` — hold the compiler
 * itself. Walking every configuration blindly fails `:spine` on
 * `org.jetbrains.kotlin:kotlin-build-tools-compat` before a line is read, i.e. it bans
 * the toolchain rather than IO. Those configurations are not in any classpath's
 * `extendsFrom` graph and cannot put a symbol in front of `import`, which is why
 * excluding them is a STRUCTURAL statement and not a name-keyed exception. The
 * project-edge ban above stays over every configuration, because a project edge on
 * `annotationProcessor` or a test configuration is still a DAG violation.
 */
    private fun classpathFeedingConfigurations(): Set<Configuration> {
        val sinks = listOf("compileClasspath", "runtimeClasspath", "testCompileClasspath", "testRuntimeClasspath")
            .mapNotNull { project.configurations.findByName(it) }
        val reached = linkedSetOf<Configuration>()
        fun walk(cfg: Configuration) {
            if (reached.add(cfg)) cfg.extendsFrom.forEach { walk(it) }
        }
        sinks.forEach { walk(it) }
        return reached
    }

/**
 * §3's IO law for one module, as a MEASURED allow-set. Exactly two plugins own this
 * — `adr.block` and `adr.spine` (ADR-001:366): "check()s compose by conjunction, so
 * a ban in adr.kotlin.library (applied by every module) would fail the very :app and
 * :block:<x>:adapter classpaths this table permits".
 */
    fun denyExternalLibrariesExcept(plugin: String, allowed: Set<String>) {
        project.afterEvaluate {
            classpathFeedingConfigurations().forEach { cfg ->
            cfg.allDependencies.filterIsInstance<ExternalModuleDependency>().forEach { dep ->
                val coordinate = "${dep.group}:${dep.name}"
                    check(coordinate in allowed) {
                        "$plugin: ${project.path} is PURE — ADR-001 §3 forbids an IO/external library on its " +
                            "classpath. Found $coordinate on configuration '${cfg.name}'; the MEASURED " +
                            "allow-set is ${allowed.sorted()}."
                    }
                }
            }
        }
    }

/**
 * The transitive half, wired into `check`: nothing outside [allowed] may reach a pure
 * module's RESOLVED runtimeClasspath, whatever route it took to get there.
 */
    fun assertPureRuntimeClasspath(plugin: String, allowed: Set<String>) {
        val modulePath = project.path
        val assertion = project.tasks.register("checkPureRuntimeClasspath") {
        group = "verification"
        description = "$plugin: no library outside the measured allow-set reaches this pure module's runtime."
        outputs.upToDateWhen { false }
        doLast {
            val resolved = project.configurations.getByName("runtimeClasspath")
                .incoming.resolutionResult.allComponents
                .mapNotNull { it.id as? ModuleComponentIdentifier }
                .map { "${it.group}:${it.module}" }
                .toSortedSet()
            val strangers = resolved - allowed
            check(strangers.isEmpty()) {
                "$plugin: $modulePath is PURE, and ${strangers.size} library/libraries reached its " +
                    "runtimeClasspath TRANSITIVELY: ${strangers.sorted()}. A declared-dependency " +
                    "ban at configuration time cannot see these; ADR-001 §3's IO law still forbids " +
                    "them. If one is a NEW transitive of an allowed coordinate, it is measured " +
                    "residue and belongs in PURE_RUNTIME_MEASURED_RESIDUE with a reason — never in " +
                    "PURE_RUNTIME_INTENDED."
            }
            val residue = resolved.intersect(PURE_RUNTIME_MEASURED_RESIDUE)
            logger.lifecycle(
                "$plugin: $modulePath runtimeClasspath — ${resolved.size} coordinates inside the measured " +
                    "allow-set (${residue.size} of them named residue arriving through ai.torad).",
            )
        }
    }
        project.tasks.named("check").configure { dependsOn(assertion) }
    }
}
