// ── adr.root — applied by `:app` ONLY (ADR-001 §4) ─────────────────────────
// THE COMPOSITION ROOT: the only module permitted to name a concrete adapter CLASS,
// to depend on a `:block:<x>:adapter`, and to hold an IO dependency of its own.
//
// §4: "adr.root INVERTS it: it asserts that every `:block:*:adapter` in the build is
// depended on by `:app` and by nothing else." Both halves are asserted below, plus
// the roster — because a plugin nobody applies enforces nothing, and a module that
// quietly drops `adr.kotlin.library` drops its whole enforcement stack with it.
//
// `:` and `:block` are excluded BY NAME. `include(":block:<x>")` materialises an
// implicit, script-less `:block` container project, so an assertion over
// `allprojects` that did not exclude it would misfire on a project nobody authored.

plugins {
    id("adr.kotlin.library")
}

val appEdges: Set<String> =
    setOf(":spine") + ADR_BLOCKS.flatMap { listOf(":block:$it", ":block:$it:adapter") }

dependencies {
    appEdges.forEach { add("implementation", project(it)) }
}

AdrDagLaw(project).denyProjectEdgesExcept(
    plugin = "adr.root",
    allowed = appEdges,
    note = ":spine, every :block:<x> and every :block:<x>:adapter",
)

gradle.projectsEvaluated {
    val projects = rootProject.allprojects.map { it.path }.toSet()

    // (1) THE ROSTER. Exactly the fourteen modules §3 and §5 declare exist, and every one of them
    // applies adr.kotlin.library — so no module can be added, or quietly de-planted,
    // without this failing.
    val modules = (projects - ADR_NON_MODULES).sorted()
    check(modules == ADR_MODULES.sorted()) {
        "adr.root: the declared module set is not ADR-001 §3's. Expected ${ADR_MODULES.sorted()}, " +
            "found $modules (`:` and `:block` are containers and are excluded by name)."
    }
    modules.forEach { path ->
        check(rootProject.project(path).plugins.hasPlugin("adr.kotlin.library")) {
            "adr.root: $path does not apply adr.kotlin.library, so §4's per-module wiring is absent there."
        }
    }

    // (1b) AND EVERY ONE OF THEM IS UNDER §4's `.api` FREEZE. `adr.kotlin.library` applies
    // the binary-compatibility-validator under an ancestor guard, because the validator
    // configures `allprojects` from wherever it is applied and `:block:<x>:adapter` is the
    // one module §3 nests inside another. That guard is the single place a module could
    // silently lose its freeze, so the guard is not trusted. FOUR things can go wrong and
    // they are four different failures, in increasing order of quietness:
    //   (i)   the task is MISSING — loud, `apiDump` never wrote that module's dump either;
    //   (ii)  the task exists but `check` does not depend on it — quiet, `./gradlew check`
    //         is green and the freeze simply never runs;
    //   (iii) the task exists, `check` depends on it, and it is switched OFF in that
    //         module's own build script — ONE line, and the whole build stays green with
    //         the freeze gone;
    //   (iv)  the task exists, is enabled, runs — and has had its ACTION LIST emptied, so
    //         it does nothing and reports success. The quietest of the four: the build log
    //         still prints `> Task :block:<x>:apiCheck`.
    // (iii) denies the FORM, not a spelling. Gradle skips a task when it is disabled OR when
    // its `onlyIf` spec rejects it, so `enabled = false`, `onlyIf { false }`, `setOnlyIf`
    // and the reason-string overload are ONE hole with two switches, read through one
    // clause — all four measured red against a live public addition absent from the dump,
    // and `enabled = false` alone was measured GREEN before this clause existed.
    //
    // WHERE THIS STOPS, measured rather than assumed. These clauses deny every way of
    // SWITCHING the freeze off. They do not deny REPROGRAMMING it: a
    // `doFirst { throw StopExecutionException() }` on `apiCheck` is green here, and so is a
    // hand-edited `<module>/api/<name>.api`. Both are the same trust boundary — a build
    // script and a generated-and-committed dump are inputs review reads, and no assertion
    // inside the build they belong to can adjudicate them. Naming the boundary is the point;
    // an assertion that pattern-matched action bodies would be the enumerated-spelling
    // defeat this repo has already paid for.
    //
    // TWO QUASI-INTERNAL GRADLE CALLS are pinned here and recorded rather than hidden:
    // `taskDependencies.getDependencies(null)`, and the `TaskInternal` cast that is the
    // only way to read a task's `onlyIf` spec. Both hold on the Gradle version the wrapper
    // pins (gradle/wrapper/gradle-wrapper.properties) and the validator version build-logic
    // pins; a bump to either re-reads this block, exactly like the ancestor guard's.
    modules.forEach { path ->
        val module = rootProject.project(path)
        val apiCheck = module.tasks.findByName("apiCheck")
        check(apiCheck != null) {
            "adr.root: $path has no apiCheck task — ADR-001 §4's `.api` freeze is not wired there."
        }
        val blocking = module.tasks.named("check").get()
            .taskDependencies.getDependencies(null).map { it.name }
        check("apiCheck" in blocking) {
            "adr.root: $path's check does not depend on apiCheck, so the `.api` freeze never blocks."
        }
        val internals = apiCheck as org.gradle.api.internal.TaskInternal
        check(apiCheck.enabled && internals.onlyIf.isSatisfiedBy(internals)) {
            "adr.root: $path's apiCheck will not run — the `.api` freeze is silenced there."
        }
        check(apiCheck.actions.isNotEmpty()) {
            "adr.root: $path's apiCheck has no actions — the `.api` freeze is silenced there."
        }
        // (1d) THE TASK RUNNING IS NOT THE FREEZE HOLDING. apiCheck can run green over a
        // HOLLOWED validator: `ignoredClasses`/`ignoredPackages`/`nonPublicMarkers` each
        // exempt a live public declaration from the dump, and `validationDisabled` turns
        // the whole thing off while the task still succeeds — measured, a one-line
        // `ignoredClasses.add(...)` in a block's build script left a public class absent
        // from the committed dump with all three gates green. So the freeze must be held
        // over the WHOLE public surface: the validator's extension, wherever it is
        // configured for this module, must be in its DEFAULT state. Keyed on the FORM
        // (every exemption set empty, validation on) rather than on a list of names, so a
        // new exemption spelling is denied the day the plugin adds it.
        val ext = generateSequence(module) { it.parent }
            .mapNotNull { it.extensions.findByType(kotlinx.validation.ApiValidationExtension::class.java) }
            .firstOrNull()
        check(ext != null) {
            "adr.root: $path resolves no ApiValidationExtension — the `.api` freeze cannot be verified there."
        }
        check(!ext.validationDisabled) {
            "adr.root: $path has validationDisabled=true — the `.api` freeze is switched off there."
        }
        val exemptions = mapOf(
            "ignoredClasses" to ext.ignoredClasses,
            "ignoredPackages" to ext.ignoredPackages,
            "ignoredProjects" to ext.ignoredProjects,
            "nonPublicMarkers" to ext.nonPublicMarkers,
        )
        exemptions.forEach { (name, set) ->
            check(set.isEmpty()) {
                "adr.root: $path's validator declares $name=$set — the `.api` freeze exempts a live public declaration there."
            }
        }
    }

    // (1c) AND THE SAME DENIAL AGAIN AT EXECUTION TIME, because (1b)(iii) reads a state
    // something later can still flip. MEASURED: a
    // `gradle.taskGraph.whenReady { tasks.findByName("apiCheck")?.enabled = false }` in one
    // block's build script runs AFTER `projectsEvaluated`, so it walked straight through
    // (1b)(iii) — "> Task :block:console:apiCheck SKIPPED", BUILD SUCCESSFUL, and the public
    // declaration absent from the committed dump. Reading the state once at configuration
    // time closes two spellings and leaves the clock open, so the clock is closed here.
    //
    // THE DISCRIMINATOR IS PUBLIC `TaskState`, not a message string: Gradle marks a task it
    // DECIDED not to run as skipped, and separately reports the two innocent reasons a task
    // did no work — up-to-date and no-source. Silenced is the residue. That is what keeps an
    // incremental re-run and the three source-less adapter modules green while a switched-off
    // apiCheck is red, and it is why a `doLast` cannot do this job: a skipped task's own
    // actions never run, so the proof has to sit outside the task.
    //
    // `afterTask` IS DEPRECATED ON THIS GRADLE and that cost is recorded, not hidden: it
    // emits one compile warning in build-logic, and the build already declares itself
    // incompatible with the next major from other call sites. It is kept because it is the
    // only observation of what a task actually DID rather than of what it was configured to
    // do, and because the non-deprecated route — a build service registered through
    // `BuildEventsListenerRegistry` — trades a documented deprecation for a wholly internal
    // service lookup and thirty lines. Re-read this at the version bump the wrapper pins.
    gradle.taskGraph.afterTask(
        Action<Task> {
            val silenced = state.skipped && !state.upToDate && !state.noSource
            if (name == "apiCheck" && silenced) {
                error(
                    "adr.root: ${project.path}'s apiCheck was skipped at execution — " +
                        "the `.api` freeze is silenced there.",
                )
            }
        },
    )

    // (2) THE INVERSION, half one: :app depends on every adapter leaf.
    val adapters = modules.filter { it.endsWith(":adapter") }
    val appProjectEdges = configurations
        .flatMap { cfg -> cfg.allDependencies.filterIsInstance<ProjectDependency>().map { it.path } }
        .toSet()
    adapters.forEach { adapter ->
        check(adapter in appProjectEdges) {
            "adr.root: $path does not depend on $adapter — §3 makes :app the only module that may, " +
                "so an unbound adapter leaf is dead IO nothing constructs."
        }
    }

    // (3) THE INVERSION, half two: NOBODY else depends on an adapter leaf. Denies the
    // FORM over every configuration of every project, the root and the container
    // included, so a sibling block reaching an adapter cannot hide on a test or a
    // custom configuration.
    rootProject.allprojects.filter { it.path != path }.forEach { other ->
        other.configurations.forEach { cfg ->
            cfg.allDependencies.filterIsInstance<ProjectDependency>()
                .filter { it.path in adapters }
                .forEach { dep ->
                    error(
                        "adr.root: only $path may depend on an adapter leaf — ${other.path} depends " +
                            "on ${dep.path} on configuration '${cfg.name}'.",
                    )
                }
        }
    }
}
