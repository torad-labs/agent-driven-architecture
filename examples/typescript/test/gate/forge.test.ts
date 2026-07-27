// ── D2(b) / C4 — THE STAMP CANNOT BE SPELLED, ONLY MINTED ──────────────────
//
// `Signature` used to be a plain interface, and a plain interface is
// STRUCTURAL: every fold arm in the tree legitimately RECEIVES one, and a type
// a file may name is a type that file may also spell. MEASURED against the
// tree as it stood: injecting BOTH
//
//     const forgedLiteral: Signature = { by: "Human", authority: sig.authority };
//     const forgedSpread: Signature = { ...sig, by: "Human" };
//
// into `src/blocks/artifact/fold.ts` left `tsc --noEmit` at exit 0. F2's whole
// claim — an Actor is UNREPRESENTABLE where a tool could forge one — was a
// property of who happened to write the arms.
//
// This test performs the claim instead of asserting it: it runs the REAL
// compiler, under the SHIPPED compiler settings (the fixture's tsconfig
// `extends` the project's, so the probe cannot drift into looser flags), over
// a fixture that imports the LIVE `spine/pure/actor` — no frozen copy to rot
// against, which is the failure C7's derivation actually suffered here.
//
// IT IS ALSO THE REGRESSION PIN, the analogue of the Kotlin port's
// `!signature.hasDataModifier` assertion in GateTest.kt. Revert `Signature` to
// an interface and case 1 stops erroring; swap the `#` brand for the `unique
// symbol` idiom `Authority` uses and case 2 stops erroring; drop the type-only
// import discipline and case 3 stops erroring. Each is red here first.
//
// WHAT THIS LAYER DOES NOT CLAIM. It closes SPELLING, and spelling only. A
// value the compiler accepts as a `Signature` can still be produced without
// naming the class at all — `Object.assign({}, sig, { by: "Human" })` is
// `T & U`, `structuredClone(sig)` is `T -> T`, and any user-written
// `<T>(base: T, over: Partial<T>) => T` launders the brand through a generic
// signature no brand spelling can deny. That class is closed at RUNTIME
// instead, by `Object.freeze` in the constructor and by the identity check at
// the single `verb.sign` call site (src/spine/boundary/action.ts) — see
// test/spine/stamp-residue.test.ts, which is where those three walls are
// proven. The honest claim for THIS file is "the stamp cannot be spelled",
// never "the stamp cannot be forged".

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, "..", "..");
const PROBE = join(HERE, "fixtures", "forged-signature");

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

describe("D2(b) — a Signature has ONE production site, and the compiler says so", () => {
  const result = typecheck(PROBE);
  const errors = result.output.split("\n").filter((l) => /error TS/.test(l));

  it("BLOCKS every forgery — and the count is the instrument, not the exit code", () => {
    expect(result.code).not.toBe(0);
    // three vectors, three errors: a weaker shape still fails a NON-ZERO exit
    // while silently leaving one of them compiling, which is exactly the false
    // landing a bare "the probe flips" instrument would have accepted.
    expect(errors).toHaveLength(3);
    expect(errors.filter((l) => l.includes("forged.ts"))).toHaveLength(3);
    // …at three DISTINCT sites, so two errors on one line cannot stand in for
    // a vector that stopped being denied
    expect(new Set(errors.map((l) => l.replace(/^.*\((\d+),\d+\).*$/, "$1"))).size).toBe(3);
  });

  it("ALLOWS everything an arm legitimately does with the stamp it is handed", () => {
    expect(errors.filter((l) => l.includes("legitimate.ts"))).toEqual([]);
  });

  it("the fixture still spells all three vectors — a probe cannot be weakened quietly", () => {
    // Without this, "simplify the fixture" is a green-looking way to delete the
    // regression pin: drop the bare literal and reverting to an interface stops
    // being caught, drop the spread and the `unique symbol` idiom looks fine.
    const src = readFileSync(join(PROBE, "forged.ts"), "utf8");
    expect(src).toContain('{ by: "Human", authority: sig.authority }');
    expect(src).toContain('{ ...sig, by: "Human" }');
    expect(src).toContain("new Signature(");
  });
});
