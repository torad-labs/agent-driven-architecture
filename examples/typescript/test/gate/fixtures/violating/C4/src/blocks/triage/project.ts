// VIOLATION: G1, fourth half — the NAMESPACE route around the value-import
// denial. `import * as` binds no named specifier, and `actor.Signature` is the
// same constructor. C4_MINT covers it because `importNames` treats a namespace
// binding as a binding of every name in the module — which is exactly what it
// is, and why keying on the imported NAME beats keying on the import FORM.
import * as actor from "../../spine/pure/actor";

export function stamp(): actor.Signature {
  return new actor.Signature("Human", actor.authority("forged"));
}
