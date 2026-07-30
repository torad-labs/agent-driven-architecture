// ── :block:analysis:adapter — this block's live IO (ADR-001 §5) ──────────────
// The impure half of §5's ratified module pair, inside the block's own folder, so
// "pull a block out by deleting the folder" stays true under the DAG.
// `adr.block.adapter` auto-adds `:spine` and `:block:analysis`; an IO client, SDK or
// socket LIBRARY is PERMITTED here and only here (plus `:app`). Only `:app` may depend
// on this module — `adr.root` inverts §3's rule and asserts it.
//
// Its Adapter.kt arrives in ADR-001 §9's Stage 3, with the rest of the block's files;
// three of the six blocks will never have one and keep this module anyway, because §5's
// pair is unconditional and Gradle refuses a project whose directory does not exist.
plugins {
    id("adr.block.adapter")
}
