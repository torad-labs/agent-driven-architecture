// ── adr.spine — applied by `:spine` ONLY (ADR-001 §4) ──────────────────────
// THE KERNEL. §3: `:spine → (nothing)`. No project edge at all is legal here, which
// is the compile-time form of "the spine tier names nothing in your feature code"
// (gate check C15) one layer below the import rule.
//
// IO ban owner 1 of 2. The allow-set is MEASURED against the module, not copied from
// §3's prose — see SPINE_EXTERNAL_ALLOWED in AdrDag.kt, and the amendment that
// measurement asks the owner for.

plugins {
    id("adr.kotlin.library")
    id("org.jetbrains.kotlin.plugin.serialization")
}

AdrDagLaw(project).denyProjectEdgesExcept(
    plugin = "adr.spine",
    allowed = emptySet<String>(),
    note = "NO other project at all (§3: `:spine -> (nothing)`)",
)

AdrDagLaw(project).denyExternalLibrariesExcept(plugin = "adr.spine", allowed = SPINE_EXTERNAL_ALLOWED)
