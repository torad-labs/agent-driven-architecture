// VIOLATION: G1 — a ToolResult produced somewhere other than a verb or the boundary.
export const forged = { outcome: "ok", tool: "setPriority", ticket: "4118", level: "High" };

// VIOLATION: G1, the Command half — a fold arm stashes a Command no gate ever saw.
// CommandBase carries `outcome`, so a Command literal ALWAYS spells the key the
// rule denies: the coverage is structural, not incidental.
export const stashed = {
  outcome: "ok",
  tool: "setPriority",
  sig: { by: "Human", authority: "host:operator" },
  id: "forged-1",
  ticket: "9999",
  level: "High",
};

// VIOLATION: G1, the SEAL's launder half — republishing the mint under its own
// SHIPPED name puts it back within reach of a block. Denied in EVERY bucket by
// C7_LAUNDER, and a second time by C7_MINT, which reads the `from` clause: a
// re-export is an import the specifier rule can still see.
export { seal } from "@adr/spine/pure/result";
