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
