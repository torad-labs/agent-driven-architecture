// ALLOW-TEST C4, fourth half — the LEGITIMATE arm, which every block in the
// tree spells this way: it RECEIVES the stamp and reads both fields. The
// `import type` is what makes the constructor unnameable here, and a rule that
// denied this file would deny every fold arm in the system — the nuisance 15.2
// warns about, and the first thing an author would switch off.
import type { Signature } from "../../spine/pure/actor";

export function triageArm(sig: Signature): string {
  return `${sig.by} acted under ${sig.authority}`;
}
