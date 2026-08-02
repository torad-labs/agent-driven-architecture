// ALLOW-TEST for the SEAL's FORM half, at the same mint-bucket path its
// violating twin uses. The bucket is exempted from the mint's import denial, so
// what has to stay legal here is everything the shipped `step-record.ts`
// actually does: import the mint, use it INSIDE a function, and publish the two
// literal consts the schema envelope is made of.
//
// This is why the shape rule is `init.type != "Literal"` and not a blanket ban
// on `export const` — C4_SEAL's own spelling, which the boundary can afford
// because it exports no consts at all, would redden both lines below.
import { seal } from "./result";

export const SCHEMA_VERSION = 2;
export const GENESIS_SCHEMA_VERSION = 1;

/** The 14.7 upcast: the mint is CALLED here and never published. An exported
 *  function wrapping it is the residue C7_SEAL names and does not close — the
 *  same residue `boundary.ts` carries for the stamp. */
export function upcast(results: readonly unknown[]): readonly unknown[] {
  return results.map((r) => seal(r));
}
