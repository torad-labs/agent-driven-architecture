// BLOCK-INPUT for test/gate/seal.test.ts — FIVE copies, one per seam that
// accepts a transport. Each is what a fold arm can write today against a value
// it was legitimately handed, and each MUST fail to compile.
//
// THE VECTOR THIS PROBE EXISTS FOR IS THE SPREAD. `{ ...received }` carries the
// `outcome` key without writing it, so every key-named selector in the gate is
// blind to it — measured on the live tree, the spread produced no lint message
// at all — and widening the selector to deny SpreadElement would redden
// `slice.ts:withPriority`, which spreads its own slice legitimately. So the
// closure is a type and this file is the instrument.
//
// This file imports the LIVE spine, not a frozen copy of it: a probe that
// compiles against the shipped types cannot rot the way a fixture with its own
// copy of an old shape did. Do not "simplify" any line away — each names a
// DIFFERENT seam, and a weaker shape that still fails a non-zero exit while
// leaving one of them compiling is exactly the false landing the count guards.
//
// NOT HERE, deliberately, and for the reason the stamp's own probe says it:
// `Object.assign({}, received)` is `T & U`, `structuredClone` is `T -> T`, and
// any user-written `<T>(t: T) => T` launders any brand whatsoever. Those are
// assertion-free under every brand spelling and belong to the runtime layer —
// the identity check at the single `verb.sign` call site.
import type { Signature } from "../../../../src/spine/pure/actor";
import type { SealedCommand } from "../../../../src/spine/pure/command";
import type { StepRecord } from "../../../../src/spine/pure/step-record";
import type { SealedResult } from "../../../../src/spine/pure/tool-result";
import type { Dispatchers } from "../../../../src/spine/pure/verb";

declare const sig: Signature;
declare const dispatchers: Dispatchers<number>;

export function copy(received: SealedResult, command: SealedCommand): readonly unknown[] {
  // 1  THE SPREAD — a transport a fold arm minted out of one it was handed
  const spread: SealedResult = { ...received };
  // 2  the bare LITERAL, which is what the key-named rule already denies in a
  //    fold arm; here it is the TYPE refusing it, with no rule involved
  const literal: SealedResult = { outcome: "ok", tool: "setPriority" };
  // 3  handed to the FOLD, through the shipped dispatcher signature
  const folded = dispatchers.fold(0, [{ ...received }], 1, sig);
  // 4  written into a COMMITTED record's results
  const results: StepRecord["results"] = [{ ...received }];
  // 5  and the Command half — the payload edited after signing, which is the
  //    thing replay catches and this refuses one layer earlier
  const commands: StepRecord["commands"] = [{ ...command, tool: "setPriority" }];
  return [spread, literal, folded, results, commands];
}
