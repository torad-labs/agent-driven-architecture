// ── :block:inbox:adapter — this block's live IO (ADR-001 §5) ──────────────
// The impure half of §5's ratified module pair, inside the block's own folder, so
// "pull a block out by deleting the folder" stays true under the DAG.
// `adr.block.adapter` auto-adds `:spine` and `:block:inbox`; an IO client, SDK or
// socket LIBRARY is PERMITTED here and only here (plus `:app`). Only `:app` may depend
// on this module — `adr.root` inverts §3's rule and asserts it.
//
// It holds NO source, and that is the decision rather than a gap: ADR-001 §5's pair
// is UNCONDITIONAL, `inbox` owns no live IO, and Gradle refuses to configure a project
// whose directory does not exist — so the directory is committed and the module stays
// declared. ADR-001 §9's Stage 3 landed the three live-IO blocks' Adapter.kt and left
// this one empty on purpose. The emptiness is fail-closed, not merely explained: the
// root build script's `gateCompiledRootsAreGateRoots` fails the build the moment a
// file lands here, because this root is then compiled and is on neither gate list.
plugins {
    id("adr.block.adapter")
}
