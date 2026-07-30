// ── :block:analysis:adapter — this block's live IO (ADR-001 §5) ──────────────
// The impure half of §5's ratified module pair, inside the block's own folder, so
// "pull a block out by deleting the folder" stays true under the DAG.
// `adr.block.adapter` auto-adds `:spine` and `:block:analysis`; an IO client, SDK or
// socket LIBRARY is PERMITTED here and only here (plus `:app`). Only `:app` may depend
// on this module — `adr.root` inverts §3's rule and asserts it.
//
// ADR-001 §9's Stage 3 HAS LANDED: `src/main/kotlin/adr/blocks/analysis/Adapter.kt`
// is this module's ONE file. The `adr/blocks/<x>/` tail is load-bearing rather than
// cosmetic: the gate normalises every module root on `/src/main/kotlin/adr/`, so the
// adapter comes back as `blocks/analysis/Adapter.kt` — the same path the single-module
// tree emitted, which is why every rule selector and every roster keeps binding
// unedited. The package is shared with the pure half deliberately: a module PAIR is
// not a package split, and this module depends on its own block.
plugins {
    id("adr.block.adapter")
}
