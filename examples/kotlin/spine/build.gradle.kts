// ── :spine — THE KERNEL (ADR-001 §3) ──────────────────────────────────────
// Sealed Command/ToolResult/Effect/State, the exhaustive fold, the boundary, the bus,
// replay, and the nine kernel ports. It depends on NO other project; `adr.spine`
// fails configuration if one is ever declared.
//
// The three external dependencies are the MEASURED allow-set, each justified by an
// import that exists in this module: `ai.torad:torad-aisdk` by spine/agent/Loop.kt
// (G3 confines the runtime to that one file), coroutines by spine/concurrency and
// spine/pure/Mailbox.kt, serialization-json by spine/pure/Action.kt. All three are
// `implementation`, not `api`, deliberately: that is what keeps them off a pure
// block's COMPILE classpath.
//
// It also hosts the six blocks' `Contract.kt`, in `adr/blocks/<x>/`. That is not a
// layering slip, it is Kotlin's sealed rule: every variant of a sealed hierarchy must
// live in one package AND one module, so a block's transport cannot be authored
// outside the module declaring its root. The COMPILER states it —
// "Extending sealed classes or interfaces from a different module is prohibited" —
// and ToolResult.kt's own PACKAGE NOTE already documented the idiom: the file "shares
// the package `adr.contract` while staying in its own folder". Gate check C2's
// name-prefix rule is what compensates, and it is PERMANENT under the DAG rather than
// interim: a sibling's TRANSPORT stays importable across a module edge because it is
// one exported package, so no module boundary can deny it.

plugins {
    id("adr.spine")
}

dependencies {
    implementation("ai.torad:torad-aisdk:0.3.0-alpha01")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
}
