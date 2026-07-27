// VIOLATION: F2/D4, fourth half — a fold arm that can CONSTRUCT the stamp.
// An arm legitimately RECEIVES a Signature (that is the whole point of the
// stamp arriving with the fold); what it may never do is BIND the constructor.
// The value import IS the forge: with it, the arm that folds an agent's tool
// result can mint a `Human` confirmation nobody performed, and no import-name
// rule on the TYPE catches it because a block fold is allowed to name the type.
import { Signature } from "../../spine/pure/actor";

export function triageArm(sig: Signature): Signature {
  return new Signature("Human", sig.authority);
}
