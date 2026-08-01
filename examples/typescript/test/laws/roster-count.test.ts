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

function walk(dir: string, out: string[], keep: ReadonlySet<string> = EXTENSIONS): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out, keep);
    else if (keep.has(extname(entry))) out.push(full);
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
    // reading nothing. Fifteen sites state it, measured; the named ones below
    // are the load-bearing spread — the two ports' documents, the root README,
    // the shipped example page, and each port's own gate declaration.
    //
    // `wiki/index.html` LEFT THIS LIST, and the reason is the point rather than
    // an exemption. The book stated "Seventeen denying checks per port" only
    // because §17.4 carried an evidence column about the accompanying code; the
    // evidence move (docs/DECISIONS.md:142) took that column out, so the book no
    // longer makes a claim about the roster and there is nothing left there for
    // this probe to break. Keeping the needle would have forced a port-fact to
    // live in the book purely to satisfy a test — the inversion the decoupling
    // rule (docs/DECISIONS.md:147) exists to stop. The roster below is NOT
    // weaker for it: the two checkers' OWN declarations are named in its place,
    // and unlike a paragraph of prose neither can be deleted without deleting
    // the gate it configures.
    const said = staleCounts(corpus, N + 1);
    expect(said.length).toBeGreaterThanOrEqual(6);
    for (const needle of [
      "README.md",
      "examples/typescript/README.md",
      "examples/kotlin/README.md",
      "examples/typescript/eslint.config.js",
      "examples/kotlin/src/test/kotlin/adr/gate/GateTest.kt",
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

// ── THE SAME FAILURE ONE LAYER OVER: THE SPINE FILE COUNT ─────────────────
//
// The check-roster band above closes "a check landed and the prose kept the old
// number". The SPINE-ROSTER band below closes the identical failure for the
// other counted claim this repository ships, and it was written because that
// failure happened again while the band above stayed green: a landing moved both
// spine rosters (36 -> 37 in TypeScript, 37 -> 38 in Kotlin), reconciled three
// READMEs by hand, and left `OPEN-GAPS.md:148` stating the old pair as
// present-tense fact. Both gates were green over it, because the regex above
// ends in `checks?` and a file count is invisible to it.
//
// THE SIZES ARE MEASURED, never re-typed. Each port's gate pins its spine roster
// as a literal list; re-listing the LENGTH here would be a second thing to keep
// true, and a stale second copy is the exact defect this file exists to deny. So
// the two numbers are counted off the filesystem — the same directories the two
// rosters enumerate — and the prose is judged against that.
//
// THE CORPUS IS PROSE ONLY, and that is a measurement rather than a preference.
// Over every extension the check-roster band scans, a file-count band drags in
// six FALSE POSITIVES: `test/gate/gate.test.ts` and `GateTest.kt` both narrate
// "35 files" as the history their pins exist to stop, and `citations.test.ts`
// spells "37-file" and "36-file" in the same historical voice. Those sentences
// are correct and must stay. Over `.md`/`.html` alone the same patterns measured
// TWELVE hits and every one is a live spine-count claim — zero false positives —
// so prose is the pinned scope. `OPEN-GAPS.md` is in it because that is where the
// miss landed; it states no check count, so the band above is unaffected by its
// absence from that corpus.
//
// WHICH PORT A NUMBER IS ABOUT is read three ways, in order: the language named
// beside it, else the port whose home the file sits in, else neither — and a
// number with no port at all is only a problem when it matches NEITHER roster.
// That middle rule is what makes `examples/kotlin/README.md`'s bare "37 files"
// legible: after the move the Kotlin roster is 38, and 37 is still a real number
// somewhere else in the tree, so a port-blind rule would have let that line rot.

/** The two directories the two spine rosters enumerate. TS is `endsWith(".ts")`
 *  under the vendored folder; Kotlin's roster normalises to paths starting
 *  `spine/`, which on disk is the `adr/spine` package — the six block contracts
 *  that also live under `examples/kotlin/spine/` are NOT in that roster, which
 *  is why the walk starts one level deeper than the module. */
const SPINE_TS = walk(join(REPO, "examples/typescript/src/spine"), [], new Set([".ts"])).length;
const SPINE_KT = walk(
  join(REPO, "examples/kotlin/spine/src/main/kotlin/adr/spine"),
  [],
  new Set([".kt"]),
).length;

/**
 * A COUNT STATEMENT ABOUT A SPINE ROSTER, in the three shapes this tree writes:
 *   · a number then optionally "files" then optionally "in [the]" then a port —
 *     "36 files in the TypeScript port", "37 in Kotlin", "36 TS", "37 KT files";
 *   · a port then "port's" then a number — "the Kotlin port's 37";
 *   · a bare "<n> files", whose port is read off the file's own home.
 * The alternation is ordered so the language-bearing forms win at a position and
 * the bare form never double-reports the same number.
 */
const SPINE_COUNT = new RegExp(
  [
    "\\b(?<a>\\d{1,3})(?:\\s+files?)?\\s+(?:in\\s+(?:the\\s+)?)?(?<al>TS|KT|TypeScript|Kotlin)\\b",
    "\\b(?<bl>TS|KT|TypeScript|Kotlin)\\s+port's\\s+(?<b>\\d{1,3})\\b",
    "\\b(?<c>\\d{1,3})\\s+files?\\b",
  ].join("|"),
  "g",
);

const PROSE = new Set([".md", ".html"]);

const portOf = (lang: string | undefined, path: string): "ts" | "kt" | null => {
  const named = (lang ?? "").toLowerCase();
  if (named === "ts" || named === "typescript") return "ts";
  if (named === "kt" || named === "kotlin") return "kt";
  if (path.startsWith("examples/typescript/")) return "ts";
  if (path.startsWith("examples/kotlin/")) return "kt";
  return null;
};

/** Every spine-count statement in the corpus that disagrees with the measured
 *  rosters. Same band discipline as `staleCounts`: only numbers in the
 *  NEIGHBOURHOOD of a roster are read, so "3 files" in a block walkthrough is
 *  not a statement about the tier. */
export function staleSpineCounts(
  corpus: readonly { path: string; text: string }[],
  ts: number,
  kt: number,
): string[] {
  const low = Math.min(ts, kt) - 3;
  const high = Math.max(ts, kt) + 3;
  const problems: string[] = [];
  for (const file of corpus) {
    if (EXEMPT.some((e) => e.path === file.path)) continue;
    for (const match of file.text.matchAll(SPINE_COUNT)) {
      const groups = match.groups ?? {};
      const said = Number(groups.a ?? groups.b ?? groups.c);
      if (!Number.isFinite(said) || said < low || said > high) continue;
      const port = portOf(groups.al ?? groups.bl, file.path);
      const line = file.text.slice(0, match.index).split("\n").length;
      const at = `${file.path}:${line}`;
      if (port === "ts" && said !== ts) {
        problems.push(`${at}  says ${said} for the TypeScript spine; the roster is ${ts}`);
      } else if (port === "kt" && said !== kt) {
        problems.push(`${at}  says ${said} for the Kotlin spine; the roster is ${kt}`);
      } else if (port === null && said !== ts && said !== kt) {
        problems.push(`${at}  says ${said}; the spine rosters are ${ts} and ${kt}`);
      }
    }
  }
  return problems;
}

const prose = [
  ...["examples", "wiki", ".github"].flatMap((root) => walk(join(REPO, root), [], PROSE)),
  ...["README.md", "OPEN-GAPS.md"].map((name) => join(REPO, name)),
].map((full) => ({ path: full.slice(REPO.length + 1), text: readFileSync(full, "utf8") }));

describe("the spine roster count is coherent across every shipped document", () => {
  it("reads both sizes off the filesystem, and neither walk came back empty", () => {
    // Anti-vacuity. A walk that found nothing would collapse the band and make
    // every assertion below pass by measuring air; the two rosters are pinned as
    // explicit lists in their own ports, and these are the same directories.
    expect(SPINE_TS).toBeGreaterThan(30);
    expect(SPINE_KT).toBeGreaterThan(30);
    expect(prose.length).toBeGreaterThanOrEqual(10);
  });

  it("no shipped document states a stale spine roster count", () => {
    expect(staleSpineCounts(prose, SPINE_TS, SPINE_KT)).toEqual([]);
  });

  it("DENIES a stale spine count — the band is not vacuous", () => {
    // The block half, on the SHIPPED corpus rather than a synthetic string, the
    // idiom the check-roster band above already uses: ask the same function what
    // it would say if both rosters had moved by one. Every document that states
    // either count today must be reported, or this check is reading nothing.
    const said = staleSpineCounts(prose, SPINE_TS + 1, SPINE_KT + 1);
    expect(said.length).toBeGreaterThanOrEqual(12);
    for (const needle of [
      "README.md",
      "examples/typescript/README.md",
      "examples/kotlin/README.md",
      "OPEN-GAPS.md",
    ]) {
      expect(
        said.filter((s) => s.startsWith(`${needle}:`)),
        needle,
      ).not.toEqual([]);
    }
    // …and both directions are read: the TypeScript claim and the Kotlin one.
    expect(said.some((s) => s.includes("TypeScript spine"))).toBe(true);
    expect(said.some((s) => s.includes("Kotlin spine"))).toBe(true);
  });

  it("ALLOWS per-home prose and small counts — the band is what keeps it usable", () => {
    // A block walkthrough's "3 files" is not a claim about the tier, and a
    // per-home document quoting its OWN port's roster is right even though the
    // other port's number is different. Both asserted on the real shapes.
    expect(
      staleSpineCounts(
        [
          { path: "examples/typescript/README.md", text: `A tier of ${SPINE_TS} files.` },
          { path: "examples/kotlin/README.md", text: `A tier of ${SPINE_KT} files.` },
          { path: "wiki/example/x.html", text: "A verb costs 3 files and one registration." },
          { path: "README.md", text: `${SPINE_TS} TS / ${SPINE_KT} KT files, test-pinned.` },
        ],
        SPINE_TS,
        SPINE_KT,
      ),
    ).toEqual([]);
  });
});
