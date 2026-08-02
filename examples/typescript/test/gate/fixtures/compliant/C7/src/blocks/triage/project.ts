// COMPLIANT: every object key in this tree is written literally, so every
// key-named rule in the gate can read it. This is not transport and it does not
// have to be — what the FORM rule denies is the computed key, not the object.
export const classes = { PageOncall: "Irreversible", LogDecision: "Routine" };

// COMPLIANT: the seal's TYPES are readable everywhere — a fold arm is handed
// sealed transport and must be able to name what it was handed. Only the value
// binding is a production site, and this file holds none.
import type { SealedResult } from "@adr/spine/pure/result";
export const toolOf = (r: SealedResult): string => r.tool;
