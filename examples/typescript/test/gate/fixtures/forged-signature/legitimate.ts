// ALLOW-INPUT for test/gate/forge.test.ts — everything a fold arm legitimately
// does with the stamp it is handed. A wall that also denied these would be
// unshippable, so the probe requires ZERO errors from this file in the SAME
// compiler run that requires three from `forged.ts`.
import type { Signature } from "../../../../src/spine/pure/actor";

export function read(sig: Signature): string {
  return `${sig.by} acted under ${sig.authority}`;
}

/** the stamp is CARRIED, not re-made — the shape every arm signature uses */
export function carry(sig: Signature): { readonly at: number; readonly sig: Signature } {
  return { at: 0, sig };
}
