// ALLOW-TEST C4, third half — the LEGITIMATE Signature use the shape rule must
// not fire on: the sign seam carries the stamp THROUGH a verb row, and Ctx
// itself stays stampless. A rule that denied this file would be the nuisance
// 15.2 warns about, and the first thing an author would switch off.
import type { Signature } from "../../spine/pure/actor";

export interface Ctx<S> {
  readonly state: S;
}

export interface VerbRow<R, C> {
  readonly sign: (result: R, sig: Signature, id: string) => C;
}
