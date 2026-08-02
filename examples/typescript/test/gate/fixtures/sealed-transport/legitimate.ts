// ALLOW-INPUT for test/gate/seal.test.ts — everything a block author and a fold
// arm legitimately do, which the probe requires ZERO errors from in the SAME
// compiler run that requires five from `forged.ts`.
//
// The last case is the one that matters most: SPREADING IS STILL FINE. §15.2's
// nuisance bar is why the closure is a type and not a rule denying
// `SpreadElement` — a slice builder spreads its own slice, and a wall that
// reddened that would be a wall authors turn off.
import type { SetPriorityResult } from "../../../../src/blocks/triage/contract";
import type { Signature } from "../../../../src/spine/pure/actor";
import type { SealedResult } from "../../../../src/spine/pure/tool-result";
import { isSpineResult } from "../../../../src/spine/pure/tool-result";

/** A VERB BODY. Block authoring is untouched by the seal: a plain literal, the
 *  one production site 6.8 licenses, with no spine value imported at all. */
export function run(ticket: string): SetPriorityResult {
  return { outcome: "ok", tool: "setPriority", ticket, level: "High", reason: null };
}

/** A FOLD ARM reading what it was handed — `Sealed<T>` is assignable to `T`, so
 *  every field read in the tree is untouched. */
export function read(r: SealedResult): string {
  return isSpineResult(r) ? `${r.tool}: not ok` : r.tool;
}

/** CARRIED onward, which is what an arm and the boundary both do. */
export function carry(
  r: SealedResult,
  sig: Signature,
): { readonly results: readonly SealedResult[]; readonly sig: Signature } {
  return { results: [r], sig };
}

/** SPREAD INTO SOMETHING THAT IS NOT TRANSPORT — a slice line, a view row, a
 *  log record. Legal, and it must stay legal: the seal denies the copy a
 *  DESTINATION, never the spread itself. */
export function line(r: SealedResult, at: number): { readonly tool: string; readonly at: number } {
  return { ...r, at };
}
