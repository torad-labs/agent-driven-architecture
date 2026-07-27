// ALLOW-TEST C4, fourth half — THE ONE PRODUCTION SITE, spelled the way the
// shipped boundary spells it: the constructor is bound here (that is what the
// exemption is FOR), the mixed inline-`type` import is allowed here and denied
// everywhere else, and what leaves the module is a class — not the binding.
import { type Actor, type Authority, Signature } from "../pure/actor";

export class Boundary {
  stamp(by: Actor, principal: Authority): Signature {
    return new Signature(by, principal);
  }
}
