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

// EVERY adapter leaf is a directory named `adapter`, and Gradle names a jar after the
// PROJECT DIRECTORY — so all six of these modules produced `adapter.jar`, and `:app`,
// which must depend on all six, could not assemble: `distTar` failed with
// "Entry app/lib/adapter.jar is a duplicate". Renaming the modules is not available
// (ADR-001 §5 fixes the pair's names and folder), and a duplicates strategy is a
// FAKE GREEN — measured: it builds, ships ONE adapter jar holding zero classes, and the
// installed distribution dies at `ClassNotFoundException: adr.blocks.escalation.LivePager`.
// The artifact name is the thing that actually collides, so the artifact name is what
// changes; the module path, the folder and the package are untouched.
base {
    archivesName.set("${requireNotNull(project.parent).name}-adapter")
}

dependencies {
    add("implementation", project(":spine"))
    add("implementation", project(ownBlock))
}

AdrDagLaw(project).denyProjectEdgesExcept(
    plugin = "adr.block.adapter",
    allowed = setOf(":spine", ownBlock),
    note = ":spine and its own block $ownBlock and nothing else",
)
