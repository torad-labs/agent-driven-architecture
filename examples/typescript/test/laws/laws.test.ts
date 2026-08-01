// ── THE GATE FOR THE LAW REGISTRY, and its own block/allow pair ───────────
//
// §15.2's bar, applied to the registry itself: this meta-check ships a
// VIOLATING registry it must reject and a COMPLIANT one it must accept, both
// under test/laws/fixtures/. Delete any assertion body below and its
// block-test goes red immediately.
//
// Seven things are asserted against the SHIPPED laws.toml:
//   (a) every law declares an enforcement layer, from the closed vocabulary,
//       and the book's headline and the machine field agree in both directions;
//       (a') THE FLOOR RULE for the configuration-time rung: one `layers` field
//       prints one cell speaking for BOTH ports, so the rung may be claimed only
//       with a build edge named PER PORT — checked in both directions;
//   (b) a law held by a denying check names one, every on-disk fixture pointer
//       RESOLVES to a non-empty path, and no LINT-OWNED check claims the
//       value-check pair shape; (b') the value-check shape is held to the SAME
//       bar — an in-checker row names its two TEST SITES and each is RESOLVED,
//       because the branch used to require two empty fields and demand nothing
//       in their place, which is a check shipping no block-test at all, green;
//   (c) the registry regenerates the book's §15.3 table byte for byte, off a
//       SINGLE four-cell row per law — the shape §15's inversion put there,
//       with (c') holding that shape against a re-separated layer table;
//   (d) every check on each port's OWN roster traces to a law, per (law, port,
//       id) — four ids hold two laws each, so a set keyed on the id alone would
//       let either occurrence be deleted;
//   (e) a law whose NOTE credits a check with holding it names at least one;
//   (g) the PROSE around the table cannot outlive the registry — the book states
//       the vocabulary's size and no longer denies the module graph. The
//       regenerator owns the fourth CELL only, so the sentences that FRAME the
//       table had no owner at all, and both of them went stale at once;
//   (h) every BUILD EDGE resolves and still declares the token it names —
//       "pointers are resolved, never trusted", applied to the newest field.
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
  EDGE_LAYER,
  edgeProblems,
  FOUR_CELL_ROW,
  FOURTH_HEADER,
  fixtureProblems,
  LAYER_ANYWHERE_IN_A_ROW,
  type LintOwned,
  PORTS,
  parseLaws,
  type Registry,
  type Resolve,
  rosterProblems,
  rows,
  SITE,
  shapeProblems,
  VITEST_EXCLUDE,
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

/** The real edge reader. `null` rather than a throw, so a path that resolves and
 *  then cannot be read is a REPORTED problem instead of a crashed suite. */
const onDiskText = (path: string): string | null => {
  try {
    return readFileSync(join(REPO, path), "utf8");
  } catch {
    return null;
  }
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

/** Local, so this file's mutation probes read like assertions rather than like
 *  optional chains. A missing subject is the vacuity failure, not a skip. */
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) {
    throw new Error("the subject of a probe is missing");
  }
  return value;
}

/** Every in-checker half in the registry, flattened and named. A helper rather
 *  than an inline expression because two assertions read it and a third would
 *  otherwise re-spell it. */
const inCheckerSites = (registry: Registry): string[] =>
  registry.laws.flatMap((law) =>
    law.checks
      .filter((check) => check.pair === "in-checker")
      .flatMap((check) => [
        `${check.id}/${check.port}/block ${check.blockTest}`,
        `${check.id}/${check.port}/allow ${check.allowTest}`,
      ]),
  );

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

// ── (g)'s checker: the sentences that FRAME §15.3's table ──────────────────
// The regenerator owns the fourth CELL and nothing else, and `bookProblems`
// reads rows. The paragraphs around the table therefore had NO mechanical owner,
// and they are what went stale: §15.3's preamble denied a module graph both
// ports had already built, and its vocabulary sentence described a column that
// never says "configuration time". The whole gate stayed green through both.
//
// Two claims, pinned as facts about the REGISTRY rather than as a paraphrase:
//   · the book states the vocabulary's SIZE in words, and it must be the
//     registry's size. Bidirectional — growing laws.toml without the book, or
//     the book without laws.toml, is red either way.
//   · no prose anywhere in the book asserts the ports have no module graph.
//     HONEST SCOPE, in the idiom of the divergence census: this is a PHRASE
//     FAMILY, not a semantic reading, so a freshly-worded denial escapes it.
//     What it closes is every alternative the landing measured, and the
//     negative half below plants one of each so the family cannot silently
//     narrow to the one spelling that happened to ship.
const DENIES_THE_MODULE_GRAPH =
  /(?:a|A) single build module|single-module|does not exist yet|until P4 lands it/g;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven"] as const;

function proseProblems(book: string, registry: Registry): string[] {
  const problems: string[] = [];
  for (const hit of book.match(DENIES_THE_MODULE_GRAPH) ?? []) {
    problems.push(`the book still denies the module graph: "${hit}"`);
  }
  const stated = [...book.matchAll(/closed vocabulary of ([a-z]+)/g)].map((m) => m[1] as string);
  const expected = WORDS[registry.vocabulary.length];
  if (stated.length !== 1 || stated[0] !== expected) {
    problems.push(
      `the book states the vocabulary's size as [${stated.join(", ")}]; the registry declares ${registry.vocabulary.length} (${expected})`,
    );
  }
  return problems;
}

/** One sentence per alternative in the denial family, each the shape a future
 *  landing would actually write. Planted INTO the shipped book by `plant`. */
const PLANTED_DENIALS = [
  "Both reference ports are still a single build module, so no edge is drawn.",
  "A single build module cannot refuse this import.",
  "As far up the ladder as a single-module reference port reaches.",
  "The module graph that would deny these edges does not exist yet.",
  "The module graph is the end state; until P4 lands it, the checks hold these.",
] as const;

/** Splice a paragraph into §15.3, immediately above §15.4's head — the same
 *  anchor (c') builds its violating book at, and asserted present there. */
const plant = (book: string, sentence: string): string =>
  book.replace(ANCHOR_15_4, `  <p>${sentence}</p>\n${ANCHOR_15_4}`);

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
    expect(fixtureProblems(shipped.registry, onDisk, lintOwned, onDiskText)).toEqual([]);
  });

  it("(b') AN IN-CHECKER PAIR NAMES ITS TWO TEST SITES — resolved, not trusted", () => {
    // NON-EMPTY AND NAMED, in (h)'s idiom: the line above is satisfied by a
    // registry carrying no value check at all, and by a resolver that reads
    // nothing. These four strings are the pin, so a renamed case is a diff.
    expect(inCheckerSites(shipped.registry)).toEqual([
      "C13/typescript/block examples/typescript/test/gate/gate.test.ts::DENIES a registry with a verb pulled out of it",
      "C13/typescript/allow examples/typescript/test/gate/gate.test.ts::ALLOWS the shipped registry — every declared verb is registered and signs",
      "C13/kotlin/block examples/kotlin/src/test/kotlin/adr/app/TotalityTest.kt::C13 BLOCK-TEST - a registry with a verb pulled out is DENIED",
      "C13/kotlin/allow examples/kotlin/src/test/kotlin/adr/app/TotalityTest.kt::C13 - every ToolResult case has a registry entry, and every entry has a case",
    ]);
  });

  it("(b'') THE RESOLVER BINDS TO THE LIVE TREE — the C7 lesson, per port", () => {
    // THE VACUITY PROOF RIDES THE LIVE TREE, never a frozen stub. Each shipped
    // block-test is attacked in memory, in the file it actually lives in, three
    // ways an author really disables one, and the resolver must object each
    // time. A rule asserted only as "reports nothing" is satisfied by a rule
    // that matches nothing — which is exactly how C7 went silently vacuous.
    for (const port of PORTS) {
      const site = must(
        shipped.registry.laws
          .flatMap((law) => law.checks)
          .find((check) => check.pair === "in-checker" && check.port === port),
      );
      const cut = site.blockTest.indexOf(SITE);
      const path = site.blockTest.slice(0, cut);
      const title = site.blockTest.slice(cut + SITE.length);
      const real = must(onDiskText(path));
      const decl = port === "typescript" ? `it("${title}"` : `fun \`${title}\``;
      // asserted, not assumed: a rewrite that matched nothing would prove nothing
      expect(real.split(decl).length - 1, `${port} declaration is unique`).toBe(1);

      const attacks: readonly (readonly [string, string, string])[] = [
        // DELETED, with the quoting comment a deleting author leaves behind
        ["commented out", `// ${decl}`, `declares no case titled "${title}"`],
        // SWITCHED OFF — declared, quoted, and it will never run
        [
          "switched off",
          port === "typescript" ? `it.skip("${title}"` : `@Ignore\n    ${decl}`,
          "SWITCHED OFF",
        ],
        // RENAMED — the plain case the first cut already caught, kept as the floor
        [
          "renamed",
          port === "typescript" ? `it("${title} (renamed)"` : `fun \`${title} (renamed)\``,
          `declares no case titled "${title}"`,
        ],
      ];
      for (const [what, replacement, expected] of attacks) {
        const mutated = real.replace(decl, replacement);
        const readMutated = (p: string): string | null => (p === path ? mutated : onDiskText(p));
        const said = fixtureProblems(shipped.registry, onDisk, lintOwned, readMutated).join("\n");
        expect(said, `${port} / ${what}`).toContain(`C13/${port}: block-test`);
        expect(said, `${port} / ${what}`).toContain(expected);
      }
    }
  });

  it("(b''') THE RUNNER'S EXCLUDE LIST IS READ FROM ITS OWN CONFIG, not remembered", () => {
    // vitest's `exclude` REPLACES the default rather than extending it, so a
    // copy of it in the checker is a copy that can silently fall behind the
    // file that governs the runner. Bound here rather than trusted, and keyed
    // on `test: { exclude:` because that file's own banner QUOTES a second
    // exclude array while explaining why this one replaces the default.
    // Comment-stripping is the wrong tool here for a reason worth recording:
    // a glob spells `/**`, so `liveCode` reads `**` + `/` as a block comment.
    const config = read("examples/typescript/vitest.config.ts");
    const array = must(/test:\s*\{\s*exclude:\s*\[([^\]]*)\]/.exec(config))[1];
    const declared = [...String(array).matchAll(/"([^"]*)"/g)].map((m) => m[1] as string);
    expect(declared).toEqual([...VITEST_EXCLUDE]);
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

  it("(c'') THE BUILD-EDGE RUNG IS EARNED PER PORT — the set is DERIVED, not asserted", () => {
    // Non-empty and named: an assertion over an empty set proves nothing about
    // the new opener, and a silent change of WHICH laws claim the module graph
    // is exactly the drift §15.3's lead paragraph is written against.
    const edged = shipped.registry.laws.filter((l) => l.layers.includes(EDGE_LAYER));
    expect(edged.map((l) => l.id)).toEqual(["G10", "G11"]);
    for (const law of edged) {
      // the headline OPENS with the rung, because the layer census is form-keyed
      // on that first word — see LAYER_ANYWHERE_IN_A_ROW
      expect(law.headline.startsWith("Configuration-time"), law.id).toBe(true);
      // every one still names a denying check beneath the edge …
      expect(law.layers, law.id).toContain("denying-check");
      // … and earns the rung on EVERY port, which is the floor rule itself
      expect([...new Set(law.edges.map((e) => e.port))].sort(), law.id).toEqual([...PORTS].sort());
    }
    // THE EXCLUSIONS ARE MEASURED, not left to taste, and pinned so the question
    // does not reopen. G2's violating shape (a tool naming a framework) and G4's
    // (a pure module naming a foreign library) are refused at configuration time
    // on one reference port and ACCEPTED on the other — edges.test.ts runs the
    // real compiler on the accepting half. Under the floor rule that disqualifies
    // both, however structural either feels.
    for (const id of ["G2", "G4"]) {
      const law = shipped.registry.laws.find((l) => l.id === id);
      expect(law?.layers, id).not.toContain(EDGE_LAYER);
      expect(law?.edges, id).toEqual([]);
    }
  });

  it("(g) THE PROSE AROUND THE TABLE CANNOT OUTLIVE THE REGISTRY", () => {
    const book = read("wiki/index.html");
    expect(proseProblems(book, shipped.registry)).toEqual([]);

    // NEGATIVE, permanent, and one planting per alternative — the half a phrase
    // blacklist owes, in (c')'s idiom: the violating book is built FROM the
    // shipped book, so it cannot go vacuous against a live-tree rewording.
    for (const sentence of PLANTED_DENIALS) {
      const said = proseProblems(plant(book, sentence), shipped.registry);
      expect(said, sentence).not.toEqual([]);
      expect(said.join("\n"), sentence).toContain("still denies the module graph");
    }
    // and the vocabulary-size claim, in BOTH directions: the book moving without
    // the registry, and the registry moving without the book.
    expect(
      proseProblems(
        book.replace("closed vocabulary of six", "closed vocabulary of five"),
        shipped.registry,
      ).join("\n"),
    ).toContain("vocabulary's size");
    expect(
      proseProblems(book, {
        ...shipped.registry,
        vocabulary: [...shipped.registry.vocabulary, "a-seventh-rung"],
      }).join("\n"),
    ).toContain("vocabulary's size");
  });

  it("(h) every BUILD EDGE resolves, and still declares the token it names", () => {
    expect(edgeProblems(shipped.registry, onDisk, onDiskText)).toEqual([]);
    // Non-empty and NAMED, because the line above is satisfied by a registry with
    // no edges at all — the vacuous-fixture failure this file already knows.
    expect(
      shipped.registry.laws.flatMap((l) => l.edges.map((e) => `${l.id}/${e.port}/${e.token}`)),
    ).toEqual([
      'G10/typescript/"./register": "./register.ts"',
      "G10/kotlin/denyProjectEdgesExcept",
      'G11/typescript/"./register": "./register.ts"',
      "G11/kotlin/denyProjectEdgesExcept",
    ]);
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
/** The stub EDGE reader, beside the stub fixture resolver. A build file a
 *  compliant edge names still declares the tokens the fixtures use; one named
 *  `LOST` resolves and no longer declares anything, which is the deleted-wall,
 *  surviving-row case — the whole reason an edge row is resolved and not
 *  trusted. */

/** THE TEST-SITE BLOBS, KEYED BY PATH — one file per shape, because one blob
 *  cannot hold a title that is both switched off and live. Each is the smallest
 *  thing a real author would write, in the real idiom of its runner. */
const SITE_BLOBS: Readonly<Record<string, string>> = {
  // the compliant file: three titles, ALL THREE quote characters, inside an
  // ORDINARY describe — so the suite-is-off rule is proven not to trip on it.
  "fixtures/site/live.test.ts": [
    'describe("the shipped registry", () => {',
    '  it("DENIES a thinned registry", () => {});',
    "  it(`ALLOWS the shipped registry`, () => {});",
    "  it('DENIES a registry with \"confirmSeal\" pulled out of it', () => {});",
    "});",
  ].join("\n"),
  // a file the runner is configured to skip, holding a perfectly good case
  ".tsbuild/fixtures/site/live.test.ts": [
    'describe("the compiled copy", () => {',
    '  it("a case compiled into the build output", () => {});',
    "});",
  ].join("\n"),
  // not a test file at all by name, holding a perfectly good case
  "fixtures/site/notatest.ts": [
    "export const helper = 1;",
    '  it("a case in a file the runner never opens", () => {});',
  ].join("\n"),
  // the case is GONE and the note saying which case used to be here survived it
  "fixtures/site/COMMENTED.test.ts": [
    'describe("the shipped registry", () => {',
    '  // REMOVED: was it("a case only a comment remembers", () => {});',
    "});",
  ].join("\n"),
  "fixtures/site/SKIP.test.ts": [
    'describe("the shipped registry", () => {',
    '  it.skip("a case that is switched off", () => {});',
    "});",
  ].join("\n"),
  "fixtures/site/XIT.test.ts": [
    'describe("the shipped registry", () => {',
    '  xit("a case switched off with an x", () => {});',
    "});",
  ].join("\n"),
  "fixtures/site/TODO.test.ts": [
    'describe("the shipped registry", () => {',
    '  it.todo("a case that is only a plan");',
    "});",
  ].join("\n"),
  // the case is live; the SUITE holding it is not
  "fixtures/site/DESCSKIP.test.ts": [
    'describe.skip("a suite that is switched off", () => {',
    '  it("a case inside a suite that is switched off", () => {});',
    "});",
  ].join("\n"),
  "fixtures/site/Totality.kt": [
    "class TotalityTest {",
    "    @Test",
    "    fun `a registry with a verb pulled out is DENIED`() {}",
    "",
    "    @Test",
    "    fun `every declared verb is registered`() {}",
    "}",
  ].join("\n"),
  "fixtures/site/COMMENTED.kt": [
    "class TotalityTest {",
    "    /* was:",
    "    @Test",
    "    fun `a case only the comment remembers`() {}",
    "    */",
    "}",
  ].join("\n"),
  "fixtures/site/IGNORED.kt": [
    "class TotalityTest {",
    "    @Test",
    '    @Ignore("flaky since the rewrite")',
    "    fun `a case switched off with Ignore`() {}",
    "}",
  ].join("\n"),
  "fixtures/site/DISABLED.kt": [
    "class TotalityTest {",
    "    @Test",
    "    @Disabled",
    "    fun `a case switched off with Disabled`() {}",
    "}",
  ].join("\n"),
  "fixtures/site/NOTEST.kt": [
    "class TotalityTest {",
    "    fun `a helper that carries no Test annotation`() {}",
    "}",
  ].join("\n"),
  // the title is QUOTED, in live code, and declares nothing — the case that
  // makes DECLARATION POSITION non-vacuous
  "fixtures/site/MENTION.kt": [
    "class TotalityTest {",
    "    @Test",
    "    fun `the case that mentions another`() {",
    '        assertEquals(listOf("a case nobody declares, only mentions"), said)',
    "    }",
    "}",
  ].join("\n"),
};

const stubRead = (path: string): string | null =>
  path.includes("GONE")
    ? null
    : path.includes("LOST")
      ? "a build file whose declaration was deleted"
      : (SITE_BLOBS[path] ?? 'denyProjectEdgesExcept(":spine")   "./register": "./register.ts"');

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

  /** Every value-shape assertion below reads this one report, so a rule that
   *  stopped firing goes red on its OWN named case and cannot hide behind a
   *  sibling. */
  const fixtures = fixtureProblems(registry, stub, stubOwned, stubRead).join("\n");

  it("REJECTS a denying-check law whose fixture pointer names nothing on disk", () => {
    expect(fixtures).toContain("violating fixture");
  });

  it("REJECTS a denying-check law that names no check at all", () => {
    expect(fixtures).toContain('layer "denying-check" but no check');
  });

  it("REJECTS a LINT-OWNED check claiming the in-checker pair shape", () => {
    expect(fixtures).toContain(
      "G4/C2/typescript: a lint-owned check may not claim an in-checker pair",
    );
  });

  it("REJECTS a value check whose in-checker pair NAMES NO BLOCK-TEST", () => {
    // The hole itself: two required-empty fields and nothing owed in their
    // place is a check that may ship no block-test at all and still pass (b).
    expect(fixtures).toContain(
      "G17/C13/typescript: the block-test half of an in-checker pair names no test site",
    );
  });

  it("REJECTS a named case the file does not DECLARE — the vacuous-site failure", () => {
    expect(fixtures).toContain(
      'G17/C13/kotlin: block-test fixtures/site/Totality.kt declares no case titled "a case nobody ever wrote"',
    );
  });

  it("REJECTS a test site whose file is not there, and one that is not a site", () => {
    expect(fixtures).toContain(
      "G18/C13/typescript: block-test file fixtures/GONE/live.test.ts is missing",
    );
    expect(fixtures).toContain(
      'G18/C13/kotlin: block-test site "fixtures/site/Totality.kt" is not <path>::<test title>',
    );
  });

  it("REJECTS an ON-DISK row wearing a test site — a row read two ways", () => {
    expect(fixtures).toContain(
      "G19/C1/typescript: an on-disk pair names two trees, not a test site",
    );
  });

  it("REJECTS an IN-CHECKER row wearing a fixture tree — the mirrored defect", () => {
    // The guard that was already there and had no block-test of its own, which
    // is how the shape stayed unproven for a landing.
    expect(fixtures).toContain("G20/C13/typescript: an in-checker pair names no path");
  });

  it("REJECTS a case that survives ONLY in the comment its deleter left behind", () => {
    // The exact bypass `edgeProblems` was hardened against, and the exact bypass
    // the first cut of the site reader shipped with. Both ports, because the
    // comment syntax is shared and a one-port proof would prove one reader.
    expect(fixtures).toContain(
      'G21/C13/typescript: block-test fixtures/site/COMMENTED.test.ts declares no case titled "a case only a comment remembers"',
    );
    expect(fixtures).toContain(
      'G21/C13/kotlin: block-test fixtures/site/COMMENTED.kt declares no case titled "a case only the comment remembers"',
    );
  });

  it("REJECTS an IN-CHECKER pair that is ONE input named twice", () => {
    expect(fixtures).toContain(
      "G22/C13/typescript: an in-checker pair's two halves are two DIFFERENT inputs",
    );
  });

  it("REJECTS an ON-DISK pair that is ONE tree named twice — the SAME helper", () => {
    // The parity this module's own header claims. While only one branch
    // compared its halves, the sentence "held to the same bar" was false.
    expect(fixtures).toContain(
      "G22/C1/kotlin: an on-disk pair's two halves are two DIFFERENT trees",
    );
  });

  it("REJECTS a case switched off with it.skip, and one with @Ignore", () => {
    expect(fixtures).toContain(
      'G23/C13/typescript: block-test fixtures/site/SKIP.test.ts declares "a case that is switched off" SWITCHED OFF',
    );
    expect(fixtures).toContain(
      'G23/C13/kotlin: block-test fixtures/site/IGNORED.kt declares "a case switched off with Ignore" SWITCHED OFF',
    );
  });

  it("REJECTS a case switched off with xit, and one with @Disabled", () => {
    // Its own case, per the rule that a matcher catching one spelling need not
    // catch the next: the `x` prefix is not a modifier chain at all.
    expect(fixtures).toContain(
      'G24/C13/typescript: block-test fixtures/site/XIT.test.ts declares "a case switched off with an x" SWITCHED OFF',
    );
    expect(fixtures).toContain(
      'G24/C13/kotlin: block-test fixtures/site/DISABLED.kt declares "a case switched off with Disabled" SWITCHED OFF',
    );
  });

  it("REJECTS a case that is only it.todo, and a fun carrying no @Test", () => {
    expect(fixtures).toContain(
      'G25/C13/typescript: block-test fixtures/site/TODO.test.ts declares "a case that is only a plan" SWITCHED OFF',
    );
    expect(fixtures).toContain(
      'G25/C13/kotlin: block-test fixtures/site/NOTEST.kt declares no @Test on "a helper that carries no Test annotation"',
    );
  });

  it("REJECTS a live case inside a SUITE that is switched off", () => {
    expect(fixtures).toContain(
      'G26/C13/typescript: block-test fixtures/site/DESCSKIP.test.ts declares "a case inside a suite that is switched off" SWITCHED OFF',
    );
  });

  it("REJECTS a title QUOTED in live code that declares nothing", () => {
    // Without this case the rule degenerates back to a quoted substring search:
    // the title is present, quoted, in live code, and is an argument.
    expect(fixtures).toContain(
      'G26/C13/kotlin: block-test fixtures/site/MENTION.kt declares no case titled "a case nobody declares, only mentions"',
    );
  });

  it("REJECTS a block-test the runner would never execute", () => {
    expect(fixtures).toContain(
      "G27/C13/typescript: block-test fixtures/site/notatest.ts is not a file vitest executes",
    );
    expect(fixtures).toContain(
      "G27/C13/typescript: allow-test .tsbuild/fixtures/site/live.test.ts is not a file vitest executes",
    );
  });

  it("REPORTS a PROTOTYPE-named pair instead of crashing on it", () => {
    // `REQUIRED_BY_PAIR["toString"]` off a bare index hands back a function and
    // kills the suite on `.filter`, so this case is as much about the run
    // happening at all as about the message.
    expect(problems).toEqual([]);
    expect(fixtures).toContain(
      'G28/C13/typescript: pair must be "on-disk" or "in-checker", not "toString"',
    );
  });

  it("REPORTS an ordinary typo in pair — the guard's first block-test", () => {
    expect(fixtures).toContain(
      'G28/C13/kotlin: pair must be "on-disk" or "in-checker", not "on-dsik"',
    );
  });

  it("REJECTS a pointer that resolves to an EMPTY fixture directory", () => {
    expect(fixtures).toContain("is empty");
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

  it("REJECTS layers that claim the build-edge rung the headline does not", () => {
    expect(shapeProblems(registry).join("\n")).toContain(
      'G10: headline omits "configuration-time" but layers claim it',
    );
  });

  it("REJECTS a headline that claims a build edge the layers do not", () => {
    expect(shapeProblems(registry).join("\n")).toContain(
      'G11: headline claims "configuration-time" but layers omit it',
    );
  });

  it("REJECTS the rung claimed with evidence on ONE PORT ONLY — the floor rule", () => {
    // The defect this whole field exists to close: one cell speaks for both
    // ports, so an edge on the stronger port is not a rung the cell may print.
    expect(shapeProblems(registry).join("\n")).toContain(
      'G12: layers claim "configuration-time" with no kotlin build edge',
    );
  });

  it("REJECTS the rung claimed with NO edge evidence at all", () => {
    const said = shapeProblems(registry).join("\n");
    for (const port of PORTS) {
      expect(said).toContain(`G13: layers claim "configuration-time" with no ${port} build edge`);
    }
  });

  it("REJECTS a build edge the printed cell would not report", () => {
    expect(shapeProblems(registry).join("\n")).toContain(
      'G14: names a build edge but layers omit "configuration-time"',
    );
  });

  it("REJECTS an edge whose file no longer declares the token it names", () => {
    expect(edgeProblems(registry, stub, stubRead).join("\n")).toContain(
      "G15/kotlin: build edge fixtures/LOST/build.gradle.kts no longer declares",
    );
  });

  it("REJECTS an edge pointer that names nothing on disk, and an unknown port", () => {
    const said = edgeProblems(registry, stub, stubRead).join("\n");
    expect(said).toContain("G16/typescript: build edge fixtures/GONE/package.json is missing");
    expect(said).toContain('G16/elixir: "elixir" is not one of the registry\'s ports');
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
    expect(fixtureProblems(registry, stub, stubOwned, stubRead)).toEqual([]);
    expect(edgeProblems(registry, stub, stubRead)).toEqual([]);
    // AND THE ALLOW HALF IS NOT VACUOUS HERE EITHER. Four value-check rows,
    // spanning every declaration spelling a real author writes: a double-quoted
    // TypeScript title, a BACKTICKED one, a single-quoted one whose title
    // carries a double quote — biome's own output for such a title, and the
    // input the first cut of this reader wrongly REJECTED — and a backticked
    // Kotlin function name carrying @Test. A positive half covering one
    // spelling leaves the rest of the matcher unmeasured.
    expect(inCheckerSites(registry)).toEqual([
      "C13/typescript/block fixtures/site/live.test.ts::DENIES a thinned registry",
      "C13/typescript/allow fixtures/site/live.test.ts::ALLOWS the shipped registry",
      "C13/kotlin/block fixtures/site/Totality.kt::a registry with a verb pulled out is DENIED",
      "C13/kotlin/allow fixtures/site/Totality.kt::every declared verb is registered",
      'C13/typescript/block fixtures/site/live.test.ts::DENIES a registry with "confirmSeal" pulled out of it',
      "C13/typescript/allow fixtures/site/live.test.ts::ALLOWS the shipped registry",
      "C13/kotlin/block fixtures/site/Totality.kt::a registry with a verb pulled out is DENIED",
      "C13/kotlin/allow fixtures/site/Totality.kt::every declared verb is registered",
    ]);
    // and the allow half is not vacuous: a law IS held at the edge rung here,
    // with resolving evidence on both ports.
    expect(registry.laws.filter((l) => l.layers.includes(EDGE_LAYER)).map((l) => l.id)).toEqual([
      "G3",
    ]);
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
