// ── spine/ports/bus — the append-only timeline (G9, 14.1) ────────────────────
// 12.4: a per-item failure is never session-global, and 6.8 gives one name per
// verb. Determinism is what §15.4 actually buys (14.1.1).
export const roster = [{ id: "C4", invariant: "G1 — an Actor is unrepresentable upstream" }];
export const message = "[C2] a block may not import another block's symbol";
