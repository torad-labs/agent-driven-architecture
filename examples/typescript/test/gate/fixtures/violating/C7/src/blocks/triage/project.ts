// VIOLATION: G1 — the same forged transport, spelled with a COMPUTED key.
// `ObjectExpression > Property[key.name="outcome"]` reads a NAME off the parse
// tree and this literal has none, so the enumerated-spelling rule is blind to
// it and the FORM rule is what denies it.
export const forged = { ["out" + "come"]: "ok", tool: "setPriority", ticket: "4118" };
