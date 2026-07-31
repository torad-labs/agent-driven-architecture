// ── THE COUNT-COHERENCE CHECK — a roster move cannot leave prose behind ───
//
// The failure this closes was measured, twice, on this repository: the roster
// moved and SEVEN count statements did not, three of them inside files the same
// diff was already editing — including a Kotlin test whose NAME said "fifteen"
// while its own body asserted 16, and a shipped `wiki/example/` page that then
// contradicted `wiki/index.html`. Both gates were green over all of it, because
// no instrument in either port reads prose.
//
// So the count is read from the ONE measured source — the exported `CHECKS`
// array the gate itself is built from — and every shipped file is scanned for a
// count statement about the roster that disagrees with it.
//
// THE BAND IS WHAT MAKES IT PRECISE. "one denying check", "two checks", "three
// type-aware checks", "eleven konsist checks", "thirteen denying checks" are
// PER-LAW and PER-HOME counts and are all legitimately smaller than the roster;
// a rule that flagged every number near the word "checks" would be exactly the
// nuisance 15.2 warns about, and the first author to hit it would reach for a
// suppression that is itself a gate failure. What cannot be legitimate is a
// count in the NEIGHBOURHOOD of the roster size that is not the roster size:
// that is a statement about the whole roster, stale. The band is N ± 3, which
// covers every stale spelling a landing of one or two checks can leave behind
// and stays clear of every per-home subset this tree states.
//
// EXEMPTIONS ARE DATA, with a reason each — the roster-pin idiom. There is
// exactly one, and it is the same shape the citation lint already carries: the
// checker necessarily SPELLS the stale counts it denies, so scanning its own
// source would make it deny itself.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKS } from "../../eslint.config.js";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");

/** THE ONE MEASURED SOURCE. Everything below is derived from this number. */
const N = CHECKS.length;

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

/**
 * A COUNT STATEMENT ABOUT THE ROSTER: a number — spelled or in digits —
 * followed by "check"/"checks", with at most one adjectival word and any amount
 * of closing markup in between. The markup alternative is not decoration: the
 * site this check was written for is `wiki/example/07`'s bolded count.
 */
const COUNT = new RegExp(
  `\\b(${WORDS.join("|")}|\\d{1,3})\\b(?:</strong>|</em>|</b>|&nbsp;|[-\\s])+(?:such |denying |architecture |structural |shipped )?checks?\\b`,
  "gi",
);

const numberOf = (token: string): number => {
  const word = WORDS.indexOf(token.toLowerCase() as (typeof WORDS)[number]);
  return word >= 0 ? word : Number(token);
};

/** Files that may state a count in the band without meaning the roster. Each
 *  entry carries its reason, and an addition is a diff a reviewer sees. */
const EXEMPT: readonly { readonly path: string; readonly why: string }[] = [
  {
    path: "examples/typescript/test/laws/roster-count.test.ts",
    why: "the checker's own source quotes the stale spellings it denies — the same path-scoped exclusion test/laws/citations.ts carries, and for the same reason",
  },
];

const SKIP = new Set([".git", ".gradle", "build", "node_modules", ".work", ".tsbuild", "fixtures"]);
const EXTENSIONS = new Set([".ts", ".kt", ".kts", ".js", ".md", ".html", ".toml", ".yml"]);

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(extname(entry))) out.push(full);
  }
  return out;
}

/** Every count statement in the corpus that disagrees with the measured N. */
export function staleCounts(
  corpus: readonly { path: string; text: string }[],
  n: number,
): string[] {
  const problems: string[] = [];
  for (const file of corpus) {
    if (EXEMPT.some((e) => e.path === file.path)) continue;
    for (const match of file.text.matchAll(COUNT)) {
      const said = numberOf(String(match[1]));
      if (!Number.isFinite(said) || said === n) continue;
      if (said < n - 3 || said > n + 3) continue;
      const line = file.text.slice(0, match.index).split("\n").length;
      problems.push(`${file.path}:${line}  says ${said} checks; the roster is ${n}`);
    }
  }
  return problems;
}

const corpus = [
  ...["examples", "wiki", ".github"].flatMap((root) => walk(join(REPO, root), [])),
  ...["README.md", "laws.toml"].map((name) => join(REPO, name)),
].map((full) => ({ path: full.slice(REPO.length + 1), text: readFileSync(full, "utf8") }));

describe("the roster count is coherent across every shipped file", () => {
  it("reads N from the ONE measured source, and the corpus is not empty", () => {
    expect(N).toBe(17);
    expect(corpus.length).toBeGreaterThanOrEqual(250);
  });

  it("no shipped file states a stale roster count", () => {
    expect(staleCounts(corpus, N)).toEqual([]);
  });

  it("DENIES a stale count — the check itself is not vacuous", () => {
    // The block half, on the SHIPPED corpus rather than a synthetic string: ask
    // the same function what it would say if the roster had moved to 18. Every
    // file that states the count today must be reported, or this check is
    // reading nothing. Six sites state it: both READMEs, the root README, the
    // book, the shipped example page, and the two gate rosters' own prose.
    const said = staleCounts(corpus, N + 1);
    expect(said.length).toBeGreaterThanOrEqual(6);
    for (const needle of [
      "README.md",
      "examples/typescript/README.md",
      "examples/kotlin/README.md",
      "wiki/index.html",
      "wiki/example/07-replay-and-advanced.html",
    ]) {
      expect(
        said.filter((s) => s.startsWith(`${needle}:`)),
        needle,
      ).not.toEqual([]);
    }
  });

  it("ALLOWS a per-home or per-law count — the band is what keeps it usable", () => {
    // "one denying check", "three type-aware checks", "thirteen denying checks"
    // are subsets, not the roster, and a rule that reddened them would be the
    // nuisance 15.2 warns about. Asserted on real prose from the tree.
    expect(
      staleCounts(
        [
          { path: "x.md", text: "One denying check holds it. Three checks live in detekt." },
          { path: "y.kt", text: "// Thirteen denying checks, written against Konsist's tree." },
        ],
        N,
      ),
    ).toEqual([]);
  });
});
