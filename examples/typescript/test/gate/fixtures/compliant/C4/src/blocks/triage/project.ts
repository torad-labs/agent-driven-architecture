// ALLOW-TEST C4, fourth half — the same module, imported the way every file in
// the tree imports it: by NAME, and as a type. A rule that denied this would
// deny `spine/pure/actor` outright.
import type { Signature } from "../../spine/pure/actor";

export function describe(sig: Signature): string {
  return sig.by;
}
