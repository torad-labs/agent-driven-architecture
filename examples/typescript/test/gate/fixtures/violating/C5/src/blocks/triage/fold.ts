// VIOLATION: F7/G9 — a fold arm minting an idempotency key.
import { keyedEffect } from "../../spine/pure/keyed-effect";
export const keyIt = keyedEffect;
