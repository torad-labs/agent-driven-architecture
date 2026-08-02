// ── G1 / C7 — A COPY IS NOT A CONSTRUCTION, AND THE COMPILER SAYS SO ───────
//
// C7 is a CONSTRUCTION rule. Copying is not construction, and the gate could
// not see the difference: `{ ...received }` in a fold arm carries the `outcome`
// key without writing it, so `ObjectExpression > Property[key.name="outcome"]`
// — and every other key-named selector in the config — reads nothing. MEASURED
// against the tree as it stood: the spread produced no lint message at all,
// which is why the residue was recorded rather than half-closed with a wider
// selector. Widening was not available: `slice.ts:withPriority` spreads its own
// slice, so denying SpreadElement in the pure buckets would redden idiomatic
// code, which is the nuisance §15.2 warns about.
//
// So the closure is a TYPE, and this file performs the claim instead of
// asserting it: the REAL compiler, under the SHIPPED settings (the fixture's
// tsconfig `extends` the project's, so the probe cannot drift into looser
// flags), over a fixture that imports the LIVE spine.
//
// IT IS ALSO THE REGRESSION PIN. Swap the `#` brand for the `unique symbol`
// idiom `Authority` uses and every spread vector stops erroring — a spread
// carries a brand PROPERTY over from its source, which is the measurement that
// made `Signature` a class one seam away. Widen any of the five seams back to
// `ToolResultBase` and that vector stops erroring on its own.
//
// WHAT THIS LAYER DOES NOT CLAIM. It closes assignability, and assignability
// only. `Object.assign({}, received)` is `T & U`, `structuredClone` is
// `T -> T`, any user-written `<T>(t: T) => T` launders any brand, and a direct
// `{ ...received } as SealedResult` cast asserts the brand the compiler would
// otherwise withhold — a review reached the fold that way in seventeen
// characters. All four are the SAME class: an explicit escape from the type
// system, which no type and no lint rule can close (the stamp's own probe says
// the identical thing about `as Signature`). The honest claim is *a copy is not
// assignable where the boundary and the fold accept a transport* — never "a
// transport cannot be forged". What a copy buys
// even when it is laundered is a payload edited after signing, and replay is
// what catches that: the re-fold of the committed bytes disagrees with what was
// performed.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { seal } from "../../src/spine/pure/tool-result";

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, "..", "..");
const PROBE = join(HERE, "fixtures", "sealed-transport");

function typecheck(project: string): { code: number; output: string } {
  try {
    const output = execFileSync(
      join(ROOT, "node_modules", ".bin", "tsc"),
      ["--noEmit", "-p", project],
      {
        encoding: "utf8",
        cwd: ROOT,
      },
    );
    return { code: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("C7 — a copied transport is not assignable where a transport is accepted", () => {
  const result = typecheck(PROBE);
  const errors = result.output.split("\n").filter((l) => /error TS/.test(l));

  it("BLOCKS every copy — and the count is the instrument, not the exit code", () => {
    expect(result.code).not.toBe(0);
    // five seams, five errors: a weaker shape still fails a NON-ZERO exit while
    // silently leaving one seam accepting a copy, which is exactly the false
    // landing a bare "the probe flips" instrument would have accepted.
    expect(errors).toHaveLength(5);
    expect(errors.filter((l) => l.includes("forged.ts"))).toHaveLength(5);
    // …at five DISTINCT sites, so two errors on one line cannot stand in for a
    // seam that stopped refusing.
    expect(new Set(errors.map((l) => l.replace(/^.*\((\d+),\d+\).*$/, "$1"))).size).toBe(5);
    // …and every one of them is the BRAND being missing, not some unrelated
    // type error that would make the probe pass for the wrong reason.
    expect(errors.filter((l) => l.includes("TS2322"))).toHaveLength(5);
  });

  it("ALLOWS everything a verb body and a fold arm legitimately do", () => {
    expect(errors.filter((l) => l.includes("legitimate.ts"))).toEqual([]);
  });

  it("the fixture still spells all five seams — a probe cannot be weakened quietly", () => {
    // Without this, "simplify the fixture" is a green-looking way to delete the
    // pin: drop the fold vector and widening `Dispatchers.fold` back to the open
    // base stops being caught; drop the record vectors and a committed record
    // could take a copy again.
    const src = readFileSync(join(PROBE, "forged.ts"), "utf8");
    expect(src).toContain("const spread: SealedResult = { ...received };");
    expect(src).toContain('const literal: SealedResult = { outcome: "ok", tool: "setPriority" };');
    expect(src).toContain("dispatchers.fold(0, [{ ...received }], 1, sig)");
    expect(src).toContain('const results: StepRecord["results"] = [{ ...received }];');
    expect(src).toContain('StepRecord["commands"] = [{ ...command, tool: "setPriority" }]');
  });

  it("THE COMMITTED BYTES ARE UNCHANGED — a brand that moved them would be a regression", () => {
    // The seal's shape was chosen against this constraint, not merely checked
    // after it. `#`-private is not an own property, so it is invisible to
    // `JSON.stringify`, to key order and to structural equality — which is what
    // `spine/replay`'s `sameMark` compares two records' results with, and what
    // a store would persist. A `{ value: … }` box or an enumerable marker would
    // have changed every committed record's bytes.
    const payload = { outcome: "ok", tool: "setPriority", ticket: "4118" } as const;
    const sealed = seal(payload);
    expect(JSON.stringify(sealed)).toBe(JSON.stringify(payload));
    expect(Object.keys(sealed)).toEqual(["outcome", "tool", "ticket"]);
    expect(sealed).toEqual(payload);
    // …and the payload is copied, not aliased: the seal never mutates what a
    // verb body handed back.
    expect(sealed).not.toBe(payload);
  });
});
