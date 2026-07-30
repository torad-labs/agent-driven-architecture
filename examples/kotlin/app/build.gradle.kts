// ── :app — THE COMPOSITION ROOT (ADR-001 §3) ──────────────────────────────
// Constructs every block, constructs every adapter and binds it to its port,
// constructs the boundary, builds the agent. `adr.root` auto-adds all thirteen legal
// edges — `:spine`, six `:block:<x>`, six `:block:<x>:adapter` — and asserts §4's
// INVERSION: every adapter leaf is depended on by `:app` and by nothing else. It also
// pins the roster, so a fifteenth project or a module that quietly stops applying
// `adr.kotlin.library` fails configuration.
//
// ADR-001 §9's Stage 4 HAS LANDED: `app/src/main/kotlin/adr/app/` holds the six files
// (Assemble, Contract, Demo, Main, Narrator, Wire) that used to compile in the root
// project. `app/Wire.kt` names `adr.blocks.*` — including the three live adapter
// classes `LiveRelayWriter`, `LiveDelivery` and `LivePager` — and every one of those
// now resolves across a real module edge that `adr.root` declared before the code
// arrived, which is what "the walls are proven against it now" was for.
//
// THE ENTRY POINT LIVES HERE, not in the root project: `application { mainClass }` can
// only name a class the module compiles, and `adr.app.MainKt` is compiled here.
// `./gradlew run` still works unqualified — Gradle name-matches it onto `:app:run`.
plugins {
    id("adr.root")
    application
}

// §4's table permits `:app` an IO dependency of its own, and `adr.root` applies no
// external-library ban (ADR-001:366's conjunction law names `adr.block` and
// `adr.spine` as the only two owners). These three are the ones `app/*.kt` imports:
// `ai.torad` in Demo.kt/Wire.kt, coroutines in Main.kt/Demo.kt, and
// serialization-json through `adr.spine.pure.RawInput`'s JsonElement constructor.
// They are `implementation` on `:spine`, so they are NOT on this module's compile
// classpath by inheritance and have to be declared.
dependencies {
    implementation("ai.torad:torad-aisdk:0.3.0-alpha01")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
}

application {
    mainClass.set("adr.app.MainKt")
}
