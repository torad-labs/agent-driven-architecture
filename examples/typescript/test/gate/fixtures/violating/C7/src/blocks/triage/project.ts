// VIOLATION: G1 — the same forged transport, spelled with a COMPUTED key.
// `ObjectExpression > Property[key.name="outcome"]` reads a NAME off the parse
// tree and this literal has none, so the enumerated-spelling rule is blind to
// it and the FORM rule is what denies it.
export const forged = { ["out" + "come"]: "ok", tool: "setPriority", ticket: "4118" };

// VIOLATION: G1, the IMPORT half — reaching for the boundary's own result
// constructors is the same forge one step upstream, and it had no violating
// case: `C7_IMPORT` could be deleted outright with the whole gate green.
import { refused, unhandled } from "@adr/spine/pure/result";
export const reached = [refused, unhandled];

// VIOLATION: G1, the SEAL's mint half — a block reaching for the transport seal
// can wrap `{ ...received }` and hand the result to the fold, which is the copy
// route the type wall exists to close. Reading a sealed value is a TYPE import
// and stays legal; binding the mint is not.
import { seal } from "@adr/spine/pure/result";
export const sealed = seal;
