// ── :block:console — a vertical slice, PURE (ADR-001 §3) ───────────────────
// `adr.block` auto-adds the one legal project edge (`:spine`) and rejects every other
// one on every configuration, plus any external library outside the MEASURED
// stdlib-only allow-set, plus anything that reaches this module's runtime classpath
// transitively.
//
// ADR-001 §9's Stage 3 HAS LANDED: `src/main/kotlin/adr/blocks/console/` holds
// this block's 6 pure files. `Contract.kt` is NOT among them and never will be —
// Kotlin requires every variant of a sealed hierarchy in ONE module, so the block's
// transport lives in `:spine` under `adr/blocks/console/` and normalises back under
// `blocks/console/` for the gate (see spine/build.gradle.kts). The module was DECLARED
// first on purpose: the walls were proven against it while it was empty, so the files
// landed inside enforcement rather than in front of it.
plugins {
    id("adr.block")
}
