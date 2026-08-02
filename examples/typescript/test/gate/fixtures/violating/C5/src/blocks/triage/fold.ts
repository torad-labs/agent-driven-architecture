// VIOLATION: G9 — a fold arm minting an idempotency key.
import { keyedEffect } from "@adr/spine/pure/keyed-effect";
export const keyIt = keyedEffect;

// VIOLATION: G9, the TYPE half — naming the boundary's transport type is the
// same reach as minting one, and it had no violating case at all: `C5_TYPE`
// could be deleted outright with the whole gate green.
import type { KeyedEffect } from "@adr/spine/pure/keyed-effect";
export type Alias = KeyedEffect;
