// ── :block:analysis — a vertical slice, PURE (ADR-001 §3) ───────────────────
// `adr.block` auto-adds the one legal project edge (`:spine`) and rejects every other
// one on every configuration, plus any external library outside the MEASURED
// stdlib-only allow-set, plus anything that reaches this module's runtime classpath
// transitively.
//
// Its source arrives in ADR-001 §9's Stage 2 (triage, the template) and Stage 3 (the
// other five). The module is DECLARED first on purpose: the walls are proven against it
// now, so the files land inside enforcement rather than in front of it.
plugins {
    id("adr.block")
}
