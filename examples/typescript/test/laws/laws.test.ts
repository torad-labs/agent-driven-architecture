// ── THE GATE FOR THE LAW REGISTRY, and its own block/allow pair ───────────
//
// §15.2's bar, applied to the registry itself: this meta-check ships a
// VIOLATING registry it must reject and a COMPLIANT one it must accept, both
// under test/laws/fixtures/. Delete any assertion body below and its
// block-test goes red immediately.
//
// Five things are asserted against the SHIPPED laws.toml:
//   (a) every law declares an enforcement layer, from the closed vocabulary,
//       and the book's headline and the machine field agree in both directions;
//   (b) a law held by a denying check names one, every on-disk fixture pointer
//       RESOLVES to a non-empty path, and no LINT-OWNED check claims the
//       value-check pair shape;
//   (c) the registry regenerates the book's §15.3 table byte for byte, off a
//       SINGLE four-cell row per law — the shape §15's inversion put there,
//       with (c') holding that shape against a re-separated layer table;
//   (d) every check on each port's OWN roster traces to a law, per (law, port,
//       id) — four ids hold two laws each, so a set keyed on the id alone would
//       let either occurrence be deleted;
//   (e) a law whose NOTE credits a check with holding it names at least one.
//
// THE OWNERSHIP ORACLE IS DERIVED. `lintOwned` below is read out of the
// SHIPPED eslint config source — the `[Cn]` marker every message carries, plus
// the one rule id whose wording we do not author — exactly as the Kotlin gate
// derives `konsistOwned` from the real konsist rule list. Reading ownership off
// a hand-authored token instead would let one edited character move a live lint
// rule into the value-check carve-out and shed its fixture pair, green.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKS } from "../../eslint.config.js";
import {
  attributionProblems,
  bindingProblems,
  bookProblems,
  FOUR_CELL_ROW,
  FOURTH_HEADER,
  fixtureProblems,
  LAYER_ANYWHERE_IN_A_ROW,
  type LintOwned,
  PORTS,
  parseLaws,
  type Resolve,
  rosterProblems,
  rows,
  shapeProblems,
} from "./registry";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");

const read = (path: string): string => readFileSync(join(REPO, path), "utf8");

/** The real resolver: a pointer must EXIST and must hold something. */
const onDisk: Resolve = (path) => {
  const full = join(REPO, path);
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(full);
  } catch {
    return "missing";
  }
  if (stat.isDirectory()) return readdirSync(full).length === 0 ? "empty" : "present";
  return stat.size === 0 ? "empty" : "present";
};

// ── the ownership oracle, derived from each linter's own source ───────────
const ESLINT_SRC = read("examples/typescript/eslint.config.js");
const KONSIST_SRC = read("examples/kotlin/src/test/kotlin/adr/gate/Rules.kt");

/** The one TypeScript check whose message wording is the rule's own, so it
 *  carries no `[Cn]` marker to find. Pinned, because a check that resolved via
 *  NEITHER route would silently drop out of the derived set. */
const NON_TAG_RULE = { C9: "@typescript-eslint/switch-exhaustiveness-check" } as const;

const tsLintOwned = (id: string): boolean => {
  if (ESLINT_SRC.includes(`[${id}]`)) return true;
  const rule = (NON_TAG_RULE as Record<string, string | undefined>)[id];
  return rule !== undefined && ESLINT_SRC.includes(rule);
};

/** Kotlin's konsist half, derived the same way: a check id is konsist-owned
 *  when the shipped rule list names it. The Kotlin gate asserts the same
 *  equality from the other side (GateTest.kt), so this is a second reading of
 *  a fact that file already owns — not a second implementation of the rule. */
const ktKonsistOwned = (id: string): boolean =>
  new RegExp(`"${id}"`).test(KONSIST_SRC.replace(/\/\/.*$/gm, ""));

const lintOwned: LintOwned = (port, id) =>
  port === "typescript" ? tsLintOwned(id) : ktKonsistOwned(id);

/** The TypeScript roster. `home` is DERIVED from the config source, never
 *  copied from the roster's own `by` token. */
const tsRoster = new Map(CHECKS.map((c) => [c.id, tsLintOwned(c.id) ? "eslint" : "vitest"]));

/** The Kotlin roster, parsed out of the live GateTest.kt. An anchor that moves
 *  must fail HERE (rosterProblems rejects an empty parse), never go vacuous. */
const kotlinRoster = new Map(
  [
    ...read("examples/kotlin/src/test/kotlin/adr/gate/GateTest.kt").matchAll(
      /"(C\d+)" to "([a-z+-]+)"/g,
    ),
  ].map((m) => [m[1] as string, m[2] as string]),
);

const shipped = parseLaws(read("laws.toml"));

/** Where the deleted map used to sit. Pinned as a constant, and asserted
 *  present by the builder, so a §15.4 rename fails LOUDLY instead of silently
 *  producing an unchanged book and a fixture that proves nothing. */
const ANCHOR_15_4 = '  <h3><span class="t">15.4</span>';

/** The violating half of (c')'s fixture pair, built from the SHIPPED book so it
 *  can never go vacuous against a live-tree idiom change (the C7 lesson): the
 *  sixteen enforcement cells are lifted back out into a second table of their
 *  own, exactly as they sat before §15's inversion. `key = "id"` reproduces the
 *  deleted honest map verbatim; `key = "name"` keys the same table by invariant
 *  name with every G-token and § scrubbed, which is the counterexample a G-id
 *  census alone cannot see. G5's headline is contradicted on the way through,
 *  so the fixture is a book that states one law's layer two different ways. */
function secondLayerTable(book: string, key: "id" | "name" | "plain"): string {
  expect(book.split(ANCHOR_15_4).length - 1).toBe(1);
  const table = [...book.matchAll(FOUR_CELL_ROW)].map((m) => {
    const cell = String(m[3]).replace(
      "<strong>Discipline.</strong>",
      "<strong>Impossible to express.</strong>",
    );
    if (key === "plain") {
      // attribute-less first cell, filler second cell, layer THIRD — the exact
      // shape that walked past the attribute-keyed second-cell census.
      return `<tr><td>${m[2]}</td><td>—</td><td>${cell.replace(/G\d+|§/g, "the law")}</td></tr>`;
    }
    return key === "id"
      ? `<tr><td class="r">${m[1]}</td><td>${cell}</td></tr>`
      : `<tr><td class="r">${m[2]}</td><td>${cell.replace(/G\d+|§/g, "the law")}</td></tr>`;
  });
  return book.replace(
    ANCHOR_15_4,
    `  <div class="tbl"><table><tbody>\n${table.join("\n")}\n</tbody></table></div>\n${ANCHOR_15_4}`,
  );
}

describe("laws.toml — the law registry parses, and says what the book says", () => {
  it("parses under the registry's own grammar, with nothing skipped", () => {
    expect(shipped.problems).toEqual([]);
    expect(shipped.registry.laws.map((l) => l.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `G${i + 1}`),
    );
    // 42, not 33: C1, C7, C8 and C15 each hold two laws, so the table is keyed
    // per (law, port, check) and a structural deletion is a visible diff here.
    // 38 -> 42: G6 gains C16 and C17 on BOTH ports — the two static halves of
    // docs/DECISIONS.md:85-86.
    expect(rows(shipped.registry).length).toBe(42);
  });

  it("LINT OWNERSHIP IS DERIVED — the eslint config source, not the roster token", () => {
    const derived = CHECKS.filter((c) => tsLintOwned(c.id)).map((c) => c.id);
    // Non-empty and exactly fifteen: a change to the `[Cn]` tagging idiom must
    // fail LOUDLY here rather than quietly matching nothing (the C7 lesson).
    // 14 -> 15 with C16, which is tag-owned in this port and konsist-owned in
    // the Kotlin one. C17 does NOT join it: like C13 it is a question about the
    // TREE rather than about one file's syntax, so its home is vitest here and
    // konsist there — two homes for one invariant, both denying.
    expect(derived.length).toBe(15);
    expect(new Set(derived)).toEqual(
      new Set(CHECKS.filter((c) => c.by !== "vitest").map((c) => c.id)),
    );
    // C13 and C17 are the ids resolving via neither a tag nor a pinned rule id.
    expect(derived).not.toContain("C13");
    expect(derived).not.toContain("C17");
    expect(tsLintOwned("C9")).toBe(true);
    // The Kotlin half is derived from the shipped konsist rule list.
    expect(ktKonsistOwned("C1")).toBe(true);
    expect(ktKonsistOwned("C13")).toBe(false);
  });

  it("(a) every law declares a layer, and the headline agrees with it", () => {
    expect(shapeProblems(shipped.registry)).toEqual([]);
  });

  it("(b) every denying check names a fixture pair that RESOLVES on disk", () => {
    expect(fixtureProblems(shipped.registry, onDisk, lintOwned)).toEqual([]);
  });

  it("(c) the book's §15.3 table regenerates from laws.toml, byte for byte", () => {
    expect(bookProblems(shipped.registry, read("wiki/index.html"))).toEqual([]);
  });

  it("(c') THE LAYER RIDES THE LAW'S OWN ROW — a second layer table is red", () => {
    const book = read("wiki/index.html");
    // POSITIVE, on the LIVE book. Asserted as counts, not as the absence of a
    // message: an assertion of the form "reports 0 four-cell rows" is satisfied
    // by the empty string, by a pre-inversion book, and by any input at all.
    expect([...book.matchAll(FOUR_CELL_ROW)].length).toBe(16);
    expect([...book.matchAll(/<td class="r">G\d+<\/td>/g)].length).toBe(16);
    // EQUALITY, not zero: exactly the sixteen law rows may state a layer.
    // A zero-count over a narrower spelling was defeated twice in review.
    expect([...book.matchAll(LAYER_ANYWHERE_IN_A_ROW)].length).toBe(16);
    expect(book.split(FOURTH_HEADER).length - 1).toBe(1);

    // NEGATIVE, the shape the inversion removed, in THREE keyings. The G-id
    // keying is the literal pre-inversion map; the NAME keying carries no G-id
    // and no §, so neither a G-id census nor the citation pin can be the thing
    // that fires; the PLAIN keying strips the class attribute and inserts a
    // filler cell — the two spellings that defeated the narrower census.
    for (const key of ["id", "name", "plain"] as const) {
      const problems = bookProblems(shipped.registry, secondLayerTable(book, key));
      expect(problems, `a ${key}-keyed second layer table must be reported`).not.toEqual([]);
      expect(problems.join("\n")).toContain("an enforcement layer in a row of its own");
    }

    // And the header the whole fourth column hangs on is not deletable quietly.
    expect(bookProblems(shipped.registry, book.replace(FOURTH_HEADER, "")).join("\n")).toContain(
      "fourth column header",
    );
  });

  it("(d) every check on each port's live roster traces to a law, per port", () => {
    // 15 -> 17 in BOTH ports, together: C16 and C17 land on each port's own
    // roster in that port's own home (eslint/vitest here, konsist there), and
    // this pin is what makes the two rosters moving apart a red diff rather than
    // a quiet divergence.
    expect(kotlinRoster.size).toBe(17);
    expect(tsRoster.size).toBe(17);
    expect([...PORTS]).toEqual(["typescript", "kotlin"]);
    expect(
      rosterProblems(shipped.registry, { typescript: tsRoster, kotlin: kotlinRoster }),
    ).toEqual([]);
  });

  it("(e) a law whose note credits a check with holding it names one", () => {
    expect(attributionProblems(shipped.registry)).toEqual([]);
  });

  it("(f) the law→check binding agrees with each checker's own invariant text", () => {
    // Derived from eslint.config.js, the same way ownership is: swapping which
    // check holds G13 vs G14 in laws.toml is a red diff HERE, because C11's and
    // C15's own invariant strings name the laws they hold.
    const declared = new Map(
      CHECKS.map((c) => [
        c.id,
        new Set([...c.invariant.matchAll(/\bG(?:1[0-6]|[1-9])\b/g)].map((m) => m[0])),
      ]),
    );
    expect(bindingProblems(shipped.registry, declared, "typescript")).toEqual([]);
  });
});

// ── the meta-check's own BLOCK-TEST and ALLOW-TEST ────────────────────────
// The fixture resolver is a stub, so the two registries below can name paths
// that exist and paths that do not without either one touching the tree. The
// stub ownership oracle says "eslint owns everything except C13", which is the
// live shape and is what makes the escape-hatch row below a violation.
const stub: Resolve = (path) =>
  path.includes("EMPTY") ? "empty" : path.includes("GONE") ? "missing" : "present";
const stubOwned: LintOwned = (_port, id) => id !== "C13";

const fixture = (half: string) =>
  parseLaws(readFileSync(join(HERE, "fixtures", `${half}.toml`), "utf8"));

describe("the registry check DENIES a violating laws.toml", () => {
  const { registry, problems } = fixture("violating");

  it("parses — the violations are semantic, not grammatical", () => {
    expect(problems).toEqual([]);
  });

  it("REJECTS a law with no enforcement layer", () => {
    expect(shapeProblems(registry).join("\n")).toContain("G1: no enforcement layer declared");
  });

  it("REJECTS a denying-check law whose fixture pointer names nothing on disk", () => {
    expect(fixtureProblems(registry, stub, stubOwned).join("\n")).toContain("violating fixture");
  });

  it("REJECTS a denying-check law that names no check at all", () => {
    expect(fixtureProblems(registry, stub, stubOwned).join("\n")).toContain(
      'layer "denying-check" but no check',
    );
  });

  it("REJECTS a LINT-OWNED check claiming the in-checker pair shape", () => {
    const said = fixtureProblems(registry, stub, stubOwned).join("\n");
    expect(said).toContain("G4/C2/typescript: a lint-owned check may not claim an in-checker pair");
  });

  it("REJECTS a pointer that resolves to an EMPTY fixture directory", () => {
    expect(fixtureProblems(registry, stub, stubOwned).join("\n")).toContain("is empty");
  });

  it("REJECTS a law whose NOTE claims a check while the law names none", () => {
    expect(attributionProblems(registry).join("\n")).toContain(
      "G6: the note claims a denying check and the law names none",
    );
  });

  it("REJECTS a law present on ONE PORT only", () => {
    expect(rosterProblems(registry, {}).join("\n")).toContain(
      "G7/kotlin: the law names checks but none on this port",
    );
  });

  it("REJECTS a law that dropped one occurrence of a DUPLICATED check id", () => {
    // G8 and G9 both hold C11; G9 kept both ports, G8 lost the kotlin half.
    expect(rosterProblems(registry, {}).join("\n")).toContain(
      "G8/kotlin: the law names checks but none on this port",
    );
  });

  it("REJECTS a registry that no longer matches the book", () => {
    expect(bookProblems(registry, read("wiki/index.html"))).not.toEqual([]);
  });

  it("REJECTS a roster check that traces to no law", () => {
    const roster = new Map([["C99", "eslint"]]);
    expect(rosterProblems(registry, { typescript: roster }).join("\n")).toContain(
      "traced to no law",
    );
  });

  it("REJECTS a roster that parsed empty — the vacuous-anchor failure", () => {
    expect(rosterProblems(registry, { kotlin: new Map() }).join("\n")).toContain("parsed EMPTY");
  });
});

describe("the registry check ALLOWS a compliant laws.toml", () => {
  const { registry, problems } = fixture("compliant");

  it("accepts idiomatic registry shape untouched", () => {
    expect(problems).toEqual([]);
    expect(shapeProblems(registry)).toEqual([]);
    expect(fixtureProblems(registry, stub, stubOwned)).toEqual([]);
    expect(attributionProblems(registry)).toEqual([]);
    expect(
      rosterProblems(registry, {
        typescript: new Map([
          ["C1", "eslint"],
          ["C13", "vitest"],
        ]),
        kotlin: new Map([
          ["C1", "konsist"],
          ["C13", "junit-reflection"],
        ]),
      }),
    ).toEqual([]);
  });
});

describe("the registry grammar reports what it cannot read", () => {
  it("REJECTS a line that is neither comment, header, nor key = value", () => {
    expect(parseLaws("this is not toml\n").problems.join("\n")).toContain("key = value pair");
  });

  it("REJECTS a key outside the law schema", () => {
    expect(parseLaws('[[laws]]\nsmuggled = "x"\n').problems.join("\n")).toContain(
      "is not one of the law keys",
    );
  });

  it("REJECTS a value that is not a basic string or a string array", () => {
    expect(parseLaws("[[laws]]\nid = 7\n").problems.join("\n")).toContain("not a basic string");
  });
});
