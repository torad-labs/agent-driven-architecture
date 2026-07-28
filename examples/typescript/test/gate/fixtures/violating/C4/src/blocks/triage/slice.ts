// VIOLATION: G1, fourth half — RE-EXPORT LAUNDERING. Both forms below put
// the constructor back within reach of a file that then imports it under a name
// the value-import denial cannot key on:
//
//     export { Signature as Stamp } from "…/actor";   →   import { Stamp }
//     export * from "…/actor";                        →   import { Signature }
//
// Nothing in the tree re-exports a VALUE from this module, so both forms are
// denied outright, in every bucket including `spine/boundary`.
//
// WHAT IS LEFT AFTER ALL OF THIS, written down because a wall that overstates
// itself is worse than no wall: an explicit assertion, an `any`, and
// `new (sig.constructor as …)()` each still produce a value the compiler
// accepts as a Signature. No lint rule sees any of them. They are closed at
// RUNTIME — the minted stamp is frozen, and a Command may only carry the stamp
// its own step minted (spine/boundary/action.ts, test/spine/stamp-residue).
export { Signature as Stamp } from "../../spine/pure/actor";
export * from "../../spine/pure/actor";
