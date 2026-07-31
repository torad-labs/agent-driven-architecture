// ── C17's BLOCK-test, ALLOW-test and ANCHOR pin ────────────────────────────
// 15.2's three assertions, in the shape every other check in this gate gets:
//
//   LIVE   — it passes on the tree it defends;
//   BLOCK  — it REJECTS a violating fixture, per FILE and per SPELLING;
//   ALLOW  — it ACCEPTS the same shapes written the way the architecture asks.
//
// Plus the fourth one the C7 rot earned: the DERIVATION and the SITE ROSTER are
// pinned against the live tree, so a rename, a moved site or a derivation that
// walked to nothing fails HERE, loudly, instead of the check matching nothing.

import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { c17Violations, irreversibleLeaves, SITES } from "./c17";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const FIXTURES = join(ROOT, "test", "gate", "fixtures");

/** `{ file: count }` for a tree — a file with zero hits is ABSENT, so `{}` is
 *  "nothing fired anywhere". The per-FILE map is what makes a rule that fired on
 *  the wrong file, or twice, a visible diff (the C4 lesson). */
const byFile = (root: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const v of c17Violations(root)) counts[v.path] = (counts[v.path] ?? 0) + 1;
  return counts;
};

describe("C17 — an Irreversible effect leaf is constructed only at its pinned site", () => {
  it("PASSES on the live tree — the two leaves sit in their own arms", () => {
    expect(c17Violations(ROOT)).toEqual([]);
  });

  it("DENIES all four spellings, file by file", () => {
    // fold.ts     the plain object literal            — leaf name + class      (2)
    // project.ts  `as unknown as Wake`, an ALIASED import                      (1)
    // inbox/fold  the computed keys `["kind"]` and `["effectClass"]`          (2)
    // app/wire    the shorthand binding `const kind = "PageOncall"`            (1)
    expect(byFile(join(FIXTURES, "violating", "C17"))).toEqual({
      "blocks/triage/fold.ts": 2,
      "blocks/triage/project.ts": 1,
      "blocks/inbox/fold.ts": 2,
      "app/wire.ts": 1,
    });
  });

  it("names the ALIAS it followed — a frozen name table could not have", () => {
    const said = c17Violations(join(FIXTURES, "violating", "C17"))
      .filter((v) => v.path === "blocks/triage/project.ts")
      .map((v) => v.message);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("PageOncall");
    expect(said[0]).toContain("as `Wake`");
  });

  it("ALLOWS the compliant fixture — the pinned site, and every MATCH", () => {
    expect(c17Violations(join(FIXTURES, "compliant", "C17"))).toEqual([]);
  });
});

describe("C17's ANCHORS — the derivation and the roster bind to the live tree", () => {
  const leaves = irreversibleLeaves(ROOT);

  it("derives EXACTLY two Irreversible leaves — a derivation gone empty is RED", () => {
    // An equality, not a `> 0`: a derivation that walked to nothing agrees with
    // any tree at all, which is precisely how C7 shipped vacuous. Promote a
    // third leaf and this line is the diff that says so.
    expect(leaves.map((l) => l.kind)).toEqual(["DeliverArtifact", "PageOncall"]);
    expect(leaves.map((l) => l.declaredIn)).toEqual([
      "blocks/artifact/contract.ts",
      "blocks/escalation/contract.ts",
    ]);
  });

  it("the roster covers every derived leaf, and names no leaf that is not derived", () => {
    expect(Object.keys(SITES).sort()).toEqual(leaves.map((l) => l.kind).sort());
  });

  it("EVERY pinned site really constructs its leaf — a moved site is RED", () => {
    // The rename/move guard, executed rather than asserted: drop a leaf's site
    // from the roster and its real construction must become a violation. If the
    // construction had moved away, this produces nothing and the test fails.
    for (const leaf of leaves) {
      const withoutIt = Object.fromEntries(
        Object.entries(SITES).filter(([kind]) => kind !== leaf.kind),
      );
      const hits = c17Violations(ROOT, withoutIt);
      expect(
        hits.map((v) => v.path),
        `${leaf.kind} is no longer constructed at ${SITES[leaf.kind]?.file}`,
      ).toContain(SITES[leaf.kind]?.file);
    }
  });

  it("a MOVED site is RED — the roster points at a file that constructs nothing", () => {
    const moved = { ...SITES, PageOncall: { file: "blocks/nowhere/fold.ts", constructions: 1 } };
    expect(c17Violations(ROOT, moved).map((v) => v.path)).toContain("blocks/escalation/fold.ts");
  });

  it("A SECOND CONSTRUCTION IN THE PINNED FILE IS RED — the count is the licence", () => {
    // The shape a per-FILE roster structurally cannot catch, and the reason the
    // roster pins a COUNT: `blocks/escalation/fold.ts` holds both a Reversible
    // verb's branch and an Irreversible one's, so the file has to be allowed. Ask
    // the census for a site pinned to ZERO constructions and the one it really
    // holds is reported — which is exactly what a page added to the
    // `requestEscalation` branch would produce against the shipped pin of one.
    const tighter = {
      ...SITES,
      PageOncall: { file: "blocks/escalation/fold.ts", constructions: 0 },
    };
    const said = c17Violations(ROOT, tighter).filter((v) => v.path === "blocks/escalation/fold.ts");
    expect(said).not.toEqual([]);
    expect(said.map((v) => v.message).join("\n")).toContain("pinned to 0 construction(s)");
  });
});
