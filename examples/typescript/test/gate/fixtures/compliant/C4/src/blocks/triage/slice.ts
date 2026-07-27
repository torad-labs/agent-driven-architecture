// ALLOW-TEST C4, fourth half — a TYPE re-export binds no value and is how the
// tree's `register.ts` files publish a block's public surface. The rule must
// see the difference, or it denies the idiom every block already uses.
export type { Signature } from "../../spine/pure/actor";
