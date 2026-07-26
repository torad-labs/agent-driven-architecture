// VIOLATION: F1 — a ToolResult produced somewhere other than a verb or the boundary.
export const forged = { outcome: "ok", tool: "setPriority", ticket: "4118", level: "High" };

// VIOLATION: F1, the Command half — a fold arm stashes a Command no gate ever saw.
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
