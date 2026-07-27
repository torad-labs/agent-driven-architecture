// BLOCK-INPUT for test/gate/forge.test.ts — THREE forgeries, one per SPELLING
// vector. These are the vectors a nominal shape closes; the ones it does NOT
// close (Object.assign, structuredClone, a generic `patch<T>`, constructor
// reflection) are assertion-free, compile clean under any brand, and are
// deliberately absent here because they belong to the runtime layer instead:
// test/spine/stamp-residue.test.ts.
//
// This file imports the LIVE `src/spine/pure/actor`, not a frozen copy of it:
// C7's derivation went vacuous exactly once in this tree, when a rule kept
// matching a frozen fixture's old shape while the real tree had moved on. A
// probe that compiles against the shipped type cannot rot that way.
//
// Every line below is what a block fold arm could write today, and each one
// MUST fail to compile. Do not "simplify" any of them away: the bare literal is
// also the regression pin for the shape itself (revert `Signature` to an
// interface and only that line stops erroring), and the `new` line is the pin
// for the type-only import being what denies construction upstream.
import type { Signature } from "../../../../src/spine/pure/actor";

export function forge(sig: Signature): readonly Signature[] {
  // 1  a bare literal — what a structural interface always permitted
  const literal: Signature = { by: "Human", authority: sig.authority };
  // 2  the SPREAD, which a `unique symbol` brand does NOT deny (measured)
  const spread: Signature = { ...sig, by: "Human" };
  // 3  construction from a type-only import, which is how every file upstream
  //    of `spine/boundary` names this type (check C4 denies the value binding)
  const constructed: Signature = new Signature("Human", sig.authority);
  return [literal, spread, constructed];
}
