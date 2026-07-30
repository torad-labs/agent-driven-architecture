// VIOLATION: G9 — a fold arm minting an idempotency key.
import { keyedEffect } from "@adr/spine/pure/keyed-effect";
export const keyIt = keyedEffect;
