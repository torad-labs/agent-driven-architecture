// ── adr.block — applied by every `:block:<x>` (ADR-001 §4) ─────────────────
// A vertical slice, PURE. §3: `:block:<x>` may depend on `:spine` ONLY — not a
// sibling block, not `:app`, not its own adapter leaf, and no IO library.
//
// `:spine` is auto-added, so the legal edge is not something a block author can
// misspell; every other project edge fails configuration. IO ban owner 2 of 2.

plugins {
    id("adr.kotlin.library")
}

dependencies {
    add("implementation", project(":spine"))
}

AdrDagLaw(project).denyProjectEdgesExcept(
    plugin = "adr.block",
    allowed = setOf(":spine"),
    note = ":spine and nothing else",
)

AdrDagLaw(project).denyExternalLibrariesExcept(plugin = "adr.block", allowed = BLOCK_EXTERNAL_ALLOWED)

AdrDagLaw(project).assertPureRuntimeClasspath(plugin = "adr.block", allowed = PURE_RUNTIME_ALLOWED)
