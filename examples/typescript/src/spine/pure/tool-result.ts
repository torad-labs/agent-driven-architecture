// ── spine/pure/tool-result — the sealed ROOT of the fold's input (G12, G1) ──
// The payload a verb returns; the ONLY thing the fold consumes. Kotlin gets a
// `sealed interface ToolResult { val tool: ToolName }`. TypeScript has no
// sealed classes, so G12 is expressed natively as:
//
//   a SHARED BASE INTERFACE (`ToolResultBase`) declaring the common fields ONCE
//   + a discriminated union closed at `app/contract`
//   + a `never`-guarded exhaustive match at EVERY consumer.
//
// Two discriminants, both on the base and both load-bearing:
//   `outcome` — the TS stand-in for Kotlin's sealed-subclass dispatch. It is
//               what lets a consumer separate the spine's own two cases from a
//               block's, since a spine case carries someone ELSE's tool name.
//   `tool`    — 6.8: the verb name. The same string is the registry key, the
//               Command's name and the Notice's key. "The gate keys off names"
//               (17.6) is literally true here.
//
// HARD CONSTRAINT (G1): no variant of this hierarchy has a field of type
// Actor, Authority or Signature, and none may gain one. Enforced by check C4.

import type { ToolName } from "./ids";

export type ResultOutcome = "ok" | "unhandled" | "refused";

/** The shared base — every ToolResult in the system carries these two fields. */
export interface ToolResultBase {
  readonly outcome: ResultOutcome;
  readonly tool: ToolName;
}

/** An Action naming no registered verb, or an input that failed to decode. */
export interface Unhandled extends ToolResultBase {
  readonly outcome: "unhandled";
  readonly note: string;
}

/** The boundary gate said no. COMMITTED, so it re-folds without re-checking (G6). */
export interface Refused extends ToolResultBase {
  readonly outcome: "refused";
  readonly reason: string;
}

/** The spine's own two cases. Every other case is contributed by a block. */
export type SpineResult = Unhandled | Refused;

export function unhandled(tool: ToolName, note: string): Unhandled {
  return { outcome: "unhandled", tool, note };
}

export function refused(tool: ToolName, reason: string): Refused {
  return { outcome: "refused", tool, reason };
}

/** Narrow a base-typed result to the spine's two cases. */
export function isSpineResult(r: ToolResultBase): r is SpineResult {
  return r.outcome !== "ok";
}

// ── THE TRANSPORT SEAL — a COPY is not a production (G1) ───────────────────
// C7 is a CONSTRUCTION rule and copying is not construction. `{ ...received }`
// carries the `outcome` key without writing it, so it is invisible to every
// key-named selector in the gate — MEASURED on the live tree: the spread
// produced no lint message at all. The residue is recorded in OPEN-GAPS.md;
// this is the layer that closes its TypeScript half.
//
// THE SHAPE IS THE ONE `Signature` ALREADY USES, and for the same measured
// reason. A `unique symbol` brand — the `Authority` idiom one file away —
// denies a bare literal and leaves the spread compiling, because TypeScript's
// object-spread type carries a brand PROPERTY over from its source. A `#`
// field is not a property, so a spread cannot carry it and a copy stops being
// assignable where a sealed transport is asked for.
//
// WHY IT IS AN INTERSECTION AND NOT A WRAPPER. Every fold arm, every projection
// and every consumer READS these values by field; a `{ value: … }` box would
// put an unwrapping step in front of all of them, and the gate's own idiom is
// that a wall costs the author nothing at the read site. `Sealed<T>` is
// assignable to `T`, so every existing read is untouched — what changes is only
// what may be HANDED to the fold, to the gate and to a committed record. A verb
// body still returns a plain literal: block authoring is untouched, which is
// the one production site 6.8 licenses.
//
// WHAT IT DOES NOT CLAIM. It closes SPELLING and assignability, exactly as far
// as the stamp's own brand does: `Object.assign({}, received)` is `T & U`,
// `structuredClone` is `T -> T`, and any user-written `<T>(t: T) => T` launders
// any brand whatsoever. Those belong to the runtime layer the stamp already
// carries — the identity check at the single `verb.sign` call site — not here.
// The honest claim is "a copy is not assignable where the boundary and the fold
// accept a transport", never "a transport cannot be forged".

/** The brand. A `#` field is not a property, so no spread and no object
 *  literal can carry it — only a value this class helped build. */
export class TransportSeal {
  readonly #sealed = true;
}

/** A transport value the spine itself produced. */
export type Sealed<T> = T & TransportSeal;

/** What the fold, the gate and a committed record accept. */
export type SealedResult = Sealed<ToolResultBase>;

/** THE MINT, and it has exactly two licensed callers: `spine/boundary`, where
 *  every live result and every signed Command is produced, and 14.7's upcast in
 *  `spine/pure/step-record`, which is the one path by which a HISTORICAL
 *  payload enters the fold. Binding this name as a value anywhere else is a
 *  `[C7]` error at every specifier spelling; the type aliases above stay
 *  importable everywhere, because reading a sealed value is not minting one.
 *
 *  The constraint is `ToolResultBase` rather than a bare structural escape:
 *  `CommandBase` carries `outcome` and `tool` too, so the one mint serves both
 *  halves of the signed transport and nothing else can be handed to it. */
export function seal<T extends ToolResultBase>(value: T): Sealed<T> {
  return Object.assign(new TransportSeal(), value);
}

// ── WHICH RESULTS ARE MINE? — the block's half of the same question ─────────
// The root dispatches an "ok" result by asking each block whether it owns it,
// and TypeScript has no sealed sub-hierarchy to ask instead: the answer is a
// type predicate, which the compiler TRUSTS rather than verifies. A predicate
// whose body enumerated tool names by hand was therefore a fifth authoring site
// with no watcher on it — leave it stale after adding a verb and `tsc` exits 0,
// the lint exits 0, and the result reaches the root's unclaimed arm at run time.
//
// The predicate is now DERIVED from a table instead of written, and the table is
// a mapped type over the block's OWN result union. That does not make the
// predicate verified — nothing in this language can — but it makes the stale
// half UNWRITABLE: the claim and the union are one edit.

/** What a BLOCK contributes. The spine's own two cases are the only others, and
 *  the spine folds those itself, so every case a block declares is an "ok" one. */
export type OwnedResult = ToolResultBase & { readonly outcome: "ok" };

/**
 * THE CLAIM, as a table the compiler keeps EXACT IN BOTH DIRECTIONS.
 *
 * `Record<R["tool"], true>` is a mapped type over the block's own union's
 * discriminant, so a FRESH object literal written against it cannot drift:
 * omitting a case the union declares is a missing property, and naming one it
 * does not declare is an excess property. Freshness is what buys the second
 * half — an excess key is only an error on a literal at the call site, which is
 * why `claims` takes the table as an argument rather than reading a `const`
 * declared beside it.
 */
export type ToolClaim<R extends OwnedResult> = Readonly<Record<R["tool"], true>>;

/**
 * Derive a block's `owns` from its claim table.
 *
 * The returned predicate is a function of the two discriminants and NOTHING
 * else — `outcome`, because the spine's own arm folds `unhandled` and `refused`
 * before any block is asked, and `tool`, because 6.8 makes the tool name the
 * discriminant of the result, the key of the registry and the name of the
 * Command. A block that had to look at a payload field to recognise its own
 * result would be saying the discriminant is not one.
 */
export function claims<R extends OwnedResult>(table: ToolClaim<R>): (r: ToolResultBase) => r is R {
  const owned: ReadonlySet<ToolName> = new Set(Object.keys(table));
  return (r: ToolResultBase): r is R => r.outcome === "ok" && owned.has(r.tool);
}
