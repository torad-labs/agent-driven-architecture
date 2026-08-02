// ── settings — ADR-001 §3's module DAG, declared ───────────────────────────
// Fourteen modules: `:spine`, a PAIR per block — ADR-001 §5's ratified adapter leaf,
// "two Gradle modules per block, `:block:<x>` pure and `:block:<x>:adapter` impure,
// both inside the block's own folder", and §9 Stage 3's "Each creates its module pair"
// — and `:app`. The pair is UNCONDITIONAL: three of the six blocks own no Adapter.kt
// today and still get an adapter module, because the record that decided it is locked
// and a builder may not narrow fourteen to eleven.
//
// MEASURED COST of the literal fourteen, which the ADR does not record: Gradle 9
// REFUSES to configure a project whose directory does not exist
// ("Configuring project ':block:<x>:adapter' without an existing directory is not
// allowed"), so the three IO-less blocks ship a real, committed adapter directory
// with a one-line build script. `GateTest` proves the absence is fatal.
//
// MEASURED TRAP: `include(":block:<x>")` also materialises an IMPLICIT, script-less
// `:block` CONTAINER project — sixteen Gradle projects for fourteen declared
// modules. `adr.root`'s roster assertion therefore excludes `:` and `:block` BY
// NAME; an all-projects assertion that does not would misfire on a project nobody
// authored.

rootProject.name = "agent-driven-architecture-kotlin"

// The convention plugins are an included BUILD (ADR-001 §4), so the dependency law
// is compiled Kotlin with a type checker over it, not a script snippet per module.
pluginManagement {
    includeBuild("build-logic")
}

// ONE repository declaration for fourteen modules. ai.torad:torad-aisdk is published
// on Maven Central, so a fresh checkout resolves the runtime with no local setup (no
// publishToMavenLocal needed).
dependencyResolutionManagement {
    repositories { mavenCentral() }
}

include(":spine")
listOf("triage", "escalation", "console", "artifact", "analysis", "inbox").forEach { block ->
    include(":block:$block")
    include(":block:$block:adapter")
}
include(":app")

// ── THE ROLE-PLUGIN WALL, hosted where no module can drop it ────────────────
// Every wall in this DAG lives inside an opt-in `adr.*` role plugin, so the one
// thing that must hold unconditionally is: EVERY module applies the role plugin
// its PATH requires. Adversarial review proved the alternative twice over — a
// module that swapped its role plugin for the policy-free base
// (`adr.kotlin.library`) kept the whole build green while its entire
// enforcement stack silently vanished, and a roster assertion living inside
// `adr.root` vanished together with the plugin it was supposed to police.
// Settings is the one script a module author does not edit to change a module,
// and the same file that DECLARES the module set — deleting this wall means
// editing the DAG's own declaration, which is a diff no review misses.
// `projectsEvaluated` rather than configuration order: `hasPlugin` is reliable
// only after every build script has run.
gradle.projectsEvaluated {
    val role = { path: String ->
        when {
            path == ":" || path == ":block" -> null // the root and the implicit container
            path == ":spine" -> "adr.spine"
            path == ":app" -> "adr.root"
            Regex("^:block:[a-z]+:adapter$").matches(path) -> "adr.block.adapter"
            Regex("^:block:[a-z]+$").matches(path) -> "adr.block"
            else -> error("settings: project $path is not a path ADR-001 §3's DAG declares")
        }
    }
    gradle.rootProject.allprojects.forEach { project ->
        val required = role(project.path) ?: return@forEach
        check(project.plugins.hasPlugin(required)) {
            "settings: ${project.path} must apply id(\"$required\") — the role plugin its path " +
                "requires under ADR-001 §3/§4. Applying only the base plugin (or none) removes " +
                "every wall this module owes the DAG."
        }
    }
}
