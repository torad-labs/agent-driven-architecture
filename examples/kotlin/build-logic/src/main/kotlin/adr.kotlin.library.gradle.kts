// ── adr.kotlin.library — applied by EVERY module (ADR-001 §4) ──────────────
// Kotlin JVM, jvmTarget 21, and `java-library` so `api`/`implementation`
// separation is real: it is what keeps an IO library declared `implementation` on
// one module off a downstream module's COMPILE classpath, which is half of §3's
// IO law and is measured in AdrDag.kt.
//
// AND ADR-001 §4's API FREEZE, wired here: the binary-compatibility-validator, whose
// `apiCheck` is a dependency of `check` in all fourteen modules and compares the
// module's live ABI against the committed `<module>/api/<name>.api`. A public
// declaration the dump does not carry fails `./gradlew check` — which is what §4
// promised and, until this landed, nothing did. Regenerate with `./gradlew apiDump`.
//
// APPLIED THROUGH `apply(plugin = …)` UNDER AN ANCESTOR GUARD, and that is MEASURED
// rather than stylistic. The validator's `apply` is `allprojects { configureProject(it) }`,
// so applying it to `:block:<x>` ALSO configures `:block:<x>:adapter` — the one place
// §3's DAG nests one module inside another. The adapter then applying it itself fails
// configuration outright: "Cannot add a configuration with name 'bcv-rt-jvm-cp' as a
// configuration with that name already exists." The guard skips the second APPLICATION,
// never the wiring: the adapter is already configured by its parent's. And the guard is
// NOT TRUSTED — `adr.root` asserts, for all fourteen modules, that `apiCheck` exists,
// that `check` depends on it, and that nothing has switched it off, so a module this
// guard skipped is a build failure rather than a hole.
//
// STILL NOT WIRED HERE, and reported rather than dropped: `explicitApi()`. It is not a
// wiring change. MEASURED against the tree this plugin ships, by running the compiler in
// explicit-API WARNING mode: 485 visibility diagnostics and 27 explicit return types across
// 81 main sources — and 536 across 87 before this item narrowed 27 block declarations to
// `internal`, which is why an earlier draft of this comment quoted the pre-narrowing figure
// for the post-narrowing tree. Essentially every source the book quotes. The sweep compiles
// and both gates stay green, so the cost is the whole objection; it is its own item rather
// than a rider on the validator, and OPEN-GAPS carries the numbers.
//
// NO IO POLICY LIVES HERE, deliberately: ADR-001:366 states the conjunction law —
// a ban in the plugin every module applies would fail the very `:app` and
// `:block:<x>:adapter` classpaths §4's table permits.

plugins {
    `java-library`
    id("org.jetbrains.kotlin.jvm")
}

val bcvPluginId = "org.jetbrains.kotlinx.binary-compatibility-validator"
if (generateSequence(project.parent) { it.parent }.none { it.plugins.hasPlugin(bcvPluginId) }) {
    apply(plugin = bcvPluginId)
}

kotlin {
    jvmToolchain(21)
}
