// ── adr.block.adapter — applied by every `:block:<x>:adapter` (§4/§5) ─────
// The block's live IO, in the block's OWN folder. §3: `:block:<x>` and `:spine` and
// nothing else BY PROJECT EDGE; its IO client, SDK or socket LIBRARY is permitted —
// holding it is the whole reason the module exists, which is why no IO ban is applied
// here (ADR-001:366's conjunction law names exactly two owners, and this is not one).
//
// Only `:app` may depend on an adapter leaf; that half is `adr.root`'s inversion.

plugins {
    id("adr.kotlin.library")
}

val ownBlock: String = requireNotNull(project.parent) {
    "adr.block.adapter is applied by :block:<x>:adapter, which always has a parent project"
}.path

dependencies {
    add("implementation", project(":spine"))
    add("implementation", project(ownBlock))
}

AdrDagLaw(project).denyProjectEdgesExcept(
    plugin = "adr.block.adapter",
    allowed = setOf(":spine", ownBlock),
    note = ":spine and its own block $ownBlock and nothing else",
)
