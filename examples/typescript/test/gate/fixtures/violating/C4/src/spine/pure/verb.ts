// VIOLATION: G1, third half — Ctx hands the stamp to the tool.
// §2.3: deleting ctx.actor is what makes an Actor unrepresentable upstream. Put
// it back and every tool in the system can branch on it again. The import rule
// cannot catch this file: verb.ts imports Signature LEGITIMATELY for the sign
// seam, so only the declaration shape can be denied.
import type { Signature } from "../../spine/pure/actor";

export interface Ctx<S> {
  readonly state: S;
  readonly sig: Signature;
}
