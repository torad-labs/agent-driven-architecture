// ── :app — THE COMPOSITION ROOT (ADR-001 §3) ──────────────────────────────
// Constructs every block, constructs every adapter and binds it to its port,
// constructs the boundary, builds the agent. `adr.root` auto-adds all thirteen legal
// edges — `:spine`, six `:block:<x>`, six `:block:<x>:adapter` — and asserts §4's
// INVERSION: every adapter leaf is depended on by `:app` and by nothing else. It also
// pins the roster, so a fifteenth project or a module that quietly stops applying
// `adr.kotlin.library` fails configuration.
//
// The root's own sources arrive in ADR-001 §9's Stage 4, once the six block pairs hold
// theirs: `app/Wire.kt` names `adr.blocks.*`, which resolves out of `:block:<x>` and
// not out of the project those files are still compiling in. Until then this module is
// DECLARED and empty — the lattice before the unit, and the walls are proven against
// it now rather than after the code arrives.
plugins {
    id("adr.root")
}
