// ── adr.kotlin.library — applied by EVERY module (ADR-001 §4) ──────────────
// Kotlin JVM, jvmTarget 21, and `java-library` so `api`/`implementation`
// separation is real: it is what keeps an IO library declared `implementation` on
// one module off a downstream module's COMPILE classpath, which is half of §3's
// IO law and is measured in AdrDag.kt.
//
// NOT WIRED HERE YET, and reported rather than dropped: `explicitApi()` and
// binary-compatibility-validator (`.api` dump into `check`). ADR-001 §9 Stage 5
// schedules the `.api` freeze as its own stage, and the tree carries ZERO `public`
// modifiers and ZERO `internal` uses across 86 files today — turning explicitApi()
// on in this stage would fail every module's compile for a reason that has nothing
// to do with the DAG. Successor item P4-KT-DAG-5 owns it, against ADR-001:413-421's
// measured sets (4·4·5·6·7·6 floor, 6·5·5·8·9·8 frozen).
//
// NO IO POLICY LIVES HERE, deliberately: ADR-001:366 states the conjunction law —
// a ban in the plugin every module applies would fail the very `:app` and
// `:block:<x>:adapter` classpaths §4's table permits.

plugins {
    `java-library`
    id("org.jetbrains.kotlin.jvm")
}

kotlin {
    jvmToolchain(21)
}
