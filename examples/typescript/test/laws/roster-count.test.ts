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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

// ── THE SAME FAILURE A THIRD TIME: THE WORKSPACE PACKAGE ROSTER ───────────
//
// The two bands above close "a roster moved and the prose kept the old number"
// for the check roster and for the spine roster. This one closes it for the
// WORKSPACE roster, and it exists because that failure happened AGAIN — inside
// the landing that gave every TypeScript block its second build unit. That
// landing swept the package-count sentences by hand and reported all of them
// reconciled; it had missed one, and the reason is mechanical rather than
// careless: in `examples/typescript/vitest.config.ts` the sentence WRAPS, so the
// number sits at the end of one comment line and its noun at the start of the
// next, and no `grep` for the two words together can match across that break.
//
// So this band FLATTENS every file before it reads it — a newline plus the
// comment marker that continues the sentence collapses to a single space. That
// is the one step without which this check is silent over the very site it was
// written for, which is why it is a corpus-preparation step and not an
// afterthought inside the matcher.
//
// THE SIZE IS DERIVED, never re-typed: the `workspaces` globs in the port's own
// `package.json`, expanded against the tree exactly as `test/gate/gate.test.ts`
// expands them — splitting on the star wherever it falls, because the glob that
// names every block's second build unit carries its star in the middle. A second
// hand-list would be a second thing to keep true, and a stale second copy is the
// defect this whole file exists to deny.
//
// THE BAND IS SIX, not the ±3 the two bands above use, and that is MEASURED
// rather than chosen for symmetry. The move this check exists to catch was eight
// -> fourteen, and eight is OUTSIDE fourteen ± 3: a ±3 band here reports nothing
// at all, which would have shipped a check vacuous over its own motivating site.
// Six is wide enough to contain the pre-landing eight and still narrow enough to
// leave every per-thing count in the tree alone — the "one package" sentences
// both ports write, and the "two packages" a block now genuinely is, all sit far
// below the floor.

/** The port whose workspace roster this band reads. */
const TS_PORT = join(REPO, "examples", "typescript");

/** THE ONE MEASURED SOURCE for this band, derived from the globs themselves. */
const N_PACKAGES = (
  JSON.parse(readFileSync(join(TS_PORT, "package.json"), "utf8")) as {
    readonly workspaces: readonly string[];
  }
).workspaces.flatMap((glob) => {
  const star = glob.indexOf("*");
  if (star < 0) return [glob];
  const head = glob.slice(0, star - 1);
  const tail = glob.slice(star + 1);
  return readdirSync(join(TS_PORT, head), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${head}/${entry.name}${tail}`);
}).length;

/**
 * A COUNT STATEMENT ABOUT THE WORKSPACE ROSTER: a number — spelled or in digits
 * — then at most one adjectival word, then `package`/`packages`. Same anatomy as
 * `COUNT` above, with one deliberate difference: the adjective slot is ANY word
 * rather than a list of the ones this tree happens to write today ("private",
 * "workspace", "npm"). An enumerated slot is a spelling, and a spelling is what
 * the next author's adjective defeats.
 *
 * `<n> packages per <thing>` is excluded by the trailing lookahead, because a
 * RATIO is not a roster size. Today every per-thing count in the tree sits below
 * the band anyway; the lookahead denies the FORM so the rule does not silently
 * depend on that arithmetic staying true.
 */
const PACKAGE_COUNT = new RegExp(
  `\\b(${WORDS.join("|")}|\\d{1,3})\\b(?:</strong>|</em>|</b>|&nbsp;|[-\\s])+(?:[a-z]+ )?packages?\\b(?!\\s+per\\b)`,
  "gi",
);

/** A newline and whatever comment marker continues the sentence across it. */
const CONTINUATION = /\n\s*(?:\/\/|\*|#)?\s*/g;

type Scanned = {
  readonly path: string;
  readonly text: string;
  readonly lineAt: (index: number) => number;
};

/** Flatten a file for matching, keeping a map back to its ORIGINAL lines so a
 *  report still names a line a reader can open. */
function flatten(path: string, source: string): Scanned {
  const segments: { at: number; src: number }[] = [];
  let text = "";
  let last = 0;
  for (const match of source.matchAll(CONTINUATION)) {
    segments.push({ at: text.length, src: last });
    text += `${source.slice(last, match.index)} `;
    last = match.index + match[0].length;
  }
  segments.push({ at: text.length, src: last });
  text += source.slice(last);
  const lineAt = (index: number): number => {
    let seg = { at: 0, src: 0 };
    for (const candidate of segments) if (candidate.at <= index) seg = candidate;
    return source.slice(0, seg.src + (index - seg.at)).split("\n").length;
  };
  return { path, text, lineAt };
}

/** Its own list rather than a share of `EXEMPT` above: widening that one would
 *  quietly weaken the two bands already using it, and a loosened pin is a
 *  defect even when the loosening is convenient. */
const PACKAGE_EXEMPT: readonly { readonly path: string; readonly why: string }[] = [
  {
    path: "examples/typescript/test/laws/roster-count.test.ts",
    why: "the checker's own source quotes the stale spellings it denies — the same reason the band above exempts it",
  },
  {
    path: "examples/typescript/test/laws/citations.test.ts",
    why: "its dated, append-only delta notes narrate PAST rosters: the two at :280 and :434 were written when the roster really was eight, and editing history to satisfy a band is the opposite of the record they keep",
  },
];

/** `.json` and `.mjs` are in scope here and are not in the band above's, and
 *  that is measured rather than tidy: the port's manifest, two of its tsconfigs
 *  and the wall script all state this roster, so a scope that skipped them would
 *  be reading half the corpus. */
const PACKAGE_EXTENSIONS = new Set([
  ".ts",
  ".kt",
  ".kts",
  ".js",
  ".mjs",
  ".md",
  ".html",
  ".toml",
  ".yml",
  ".json",
]);

/** Every package-roster statement in the corpus that disagrees with the derived
 *  roster. Same band discipline as `staleCounts`. */
export function stalePackageCounts(corpus: readonly Scanned[], n: number): string[] {
  const problems: string[] = [];
  for (const file of corpus) {
    if (PACKAGE_EXEMPT.some((e) => e.path === file.path)) continue;
    for (const match of file.text.matchAll(PACKAGE_COUNT)) {
      const said = numberOf(String(match[1]));
      if (!Number.isFinite(said) || said === n) continue;
      if (said < n - 6 || said > n + 6) continue;
      problems.push(
        `${file.path}:${file.lineAt(match.index)}  says ${said} packages; the roster is ${n}`,
      );
    }
  }
  return problems;
}

const packageCorpus = [
  ...["examples", "wiki", ".github"].flatMap((root) =>
    walk(join(REPO, root), [], PACKAGE_EXTENSIONS),
  ),
  ...["README.md", "OPEN-GAPS.md", "laws.toml"].map((name) => join(REPO, name)),
].map((full) => flatten(full.slice(REPO.length + 1), readFileSync(full, "utf8")));

describe("the workspace package roster is coherent across every shipped file", () => {
  it("derives the roster from the globs, and the corpus is not empty", () => {
    // Anti-vacuity, the same shape both bands above carry: a roster read as
    // zero, or an empty corpus, would make every assertion below pass over air.
    expect(N_PACKAGES).toBe(14);
    expect(packageCorpus.length).toBeGreaterThanOrEqual(250);
  });

  it("no shipped file states a stale package roster count", () => {
    expect(stalePackageCounts(packageCorpus, N_PACKAGES)).toEqual([]);
  });

  it("DENIES the pre-landing spelling — the band is not vacuous", () => {
    // The block half over the SHIPPED corpus, the idiom both bands above use:
    // ask the same function what it would report if the roster were still the
    // eight it was before every block grew its second build unit. That is the
    // move this band exists for, and the needles are where the tree states the
    // roster — the port's manifest, both of its shared tsconfigs, its README,
    // the wall script, the gate that pins the roster itself, and the gap record
    // that tracked the split. Named rather than counted: at eight the band also
    // legitimately reaches the "two packages" a block genuinely is, so a bare
    // total would be brittle in a way the needles are not.
    const said = stalePackageCounts(packageCorpus, 8);
    expect(said.length).toBeGreaterThanOrEqual(10);
    for (const needle of [
      "examples/typescript/package.json",
      "examples/typescript/tsconfig.json",
      "examples/typescript/tsconfig.base.json",
      "examples/typescript/README.md",
      "examples/typescript/scripts/wall.mjs",
      "examples/typescript/test/gate/gate.test.ts",
      "OPEN-GAPS.md",
    ]) {
      expect(
        said.filter((s) => s.startsWith(`${needle}:`)),
        needle,
      ).not.toEqual([]);
    }
  });

  it("ALLOWS a ratio and a wrapped TRUE count — the guards that keep it usable", () => {
    // Three real shapes, all in band. A count of packages PER something is a
    // ratio and not a roster size, even when its number would otherwise land
    // inside the window — that is the trailing lookahead, and without it the
    // first line here reddens. A TRUE count that WRAPS must stay silent, which
    // is what shows the flattening joins lines to read them rather than to
    // redden them. And the roster's own number is never a problem, spelled or
    // in digits.
    expect(
      stalePackageCounts(
        [
          flatten("x.md", "A tree shipping twelve packages per port is still one roster."),
          flatten("y.ts", "// the fourteen\n// package tsconfigs inherit the base options"),
          flatten("z.md", "Fourteen private packages, none of them published."),
        ],
        N_PACKAGES,
      ),
    ).toEqual([]);
  });
});

// ── THE BLAST-RADIUS TABLE, DERIVED RATHER THAN TYPED ─────────────────────
//
// `examples/typescript/README.md` promises, in its own words, that "both
// recounts are now reproducible from one command". This turns that promise into
// a gate, and it is here because the landing that rewrote that table left TWO
// numbers behind inside it: a row whose line-number cell was advanced by one
// when the file it describes had moved by two, and a summary sentence still
// stating the pair the table held BEFORE its last three rows were rewritten.
// Both sat a few lines from edits the same diff did make, which is the whole
// argument for reading them off the tree instead of off a careful author.
//
// SCOPE, stated so a later reader does not read it as an omission. This pins the
// ONE number-class in that document with a mechanical source. Three of the six
// rows describe files whose edit sites the README's own `grep` prints exactly,
// and those three are checked cell for cell. The other three carry deliberate
// exclusions and an en-dash range no command reproduces, so their cells stay
// prose and only the COLUMN TOTALS they feed are checked. Making the whole
// README self-checking would be a new invariant owing its own enforcement layer
// under D5 (docs/DECISIONS.md:37), and it is a different item.

/** The README's own recount command, as code. */
const RECOUNT = /Inbox|inbox|noteDrop|noteFault/;

const recount = (rel: string): readonly string[] =>
  readFileSync(join(TS_PORT, rel), "utf8")
    .split("\n")
    .flatMap((line, i) => (RECOUNT.test(line) ? [String(i + 1)] : []));

/** One row of the blast-radius table: file, edit sites, declared sites, lines. */
const TABLE_ROW = /^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*(\d+)[^|]*\|([^|]*)\|\s*$/gm;

describe("the README's blast-radius table is derived, not typed", () => {
  const readme = readFileSync(join(TS_PORT, "README.md"), "utf8");
  const rows = [...readme.matchAll(TABLE_ROW)].map((m) => ({
    file: String(m[1]),
    sites: Number(m[2]),
    declared: Number(m[3]),
    lines: String(m[4]).trim(),
  }));

  it("found the table, and it is the six-row one", () => {
    // Anti-vacuity: every assertion below is silent over an empty parse.
    expect(rows.map((r) => r.file)).toEqual([
      "src/app/contract.ts",
      "src/app/assemble.ts",
      "src/app/wire.ts",
      "src/app/package.json",
      "src/app/tsconfig.json",
      "tsconfig.wall.json",
    ]);
  });

  it("states ONE pair of totals — the table and both sentences agree", () => {
    const sites = rows.reduce((n, r) => n + r.sites, 0);
    const declared = rows.reduce((n, r) => n + r.declared, 0);
    const cost =
      /\*\*Root cost: (\d+) edit sites across \d+ files, (\d+) of them declared sites\.\*\*/.exec(
        readme,
      );
    const difference = /\*\*The difference between (\d+) and (\d+) is/.exec(readme);
    expect(cost, "the root-cost sentence is present").not.toBeNull();
    expect(difference, "the difference sentence is present").not.toBeNull();
    expect([Number(cost?.[1]), Number(cost?.[2])], "root cost vs the table").toEqual([
      sites,
      declared,
    ]);
    expect(
      [Number(difference?.[1]), Number(difference?.[2])],
      "the difference sentence vs the table",
    ).toEqual([sites, declared]);
  });

  it("the three mechanical rows print what the README's own command prints", () => {
    for (const rel of ["src/app/package.json", "src/app/tsconfig.json", "tsconfig.wall.json"]) {
      const row = rows.find((r) => r.file === rel);
      const measured = recount(rel);
      expect(row?.lines, `${rel} — the lines cell`).toBe(measured.join(", "));
      expect(row?.sites, `${rel} — the edit-site count`).toBe(measured.length);
    }
  });
});

// ── THE SAME FAILURE ONE MORE LAYER OVER: A STALE FORM, NOT A NUMBER ──────
//
// The two bands above deny a count the tree has stopped earning. This one denies
// a SHAPE the tree has stopped earning, and it lives here rather than in a new
// file because this is already the owner that walks examples/, wiki/, .github/,
// README.md and OPEN-GAPS.md looking for statements the tree no longer supports.
// A new file would have moved the citation census's per-root FILE pin for a
// check that needed no new home.
//
// WHAT IT HOLDS. A block's `owns` predicate is DERIVED — `claims<XResult>({…})`
// over a table whose type is a mapped type on the block's own result union — so
// a case declared and a case claimed are ONE edit. That is a compiler property
// and it is proven must-fail in both directions by the two
// `test/gate/fixtures/owns-*-claim/` fixtures. But the compiler only holds it for
// a predicate that USES the helper. Hand-write `(r: ToolResultBase): r is
// XResult { … }` again and the whole property is gone SILENTLY: measured,
// `tsc --noEmit` exits 0 and the ownership census in test/app/totality.test.ts
// passes too, for as long as the hand-written body happens to be correct today.
// Nothing else in either port can see that bypass.
//
// SO IT DENIES THE FORM, NOT THE NAME. A rule keyed on `isXResult` would be an
// enumeration, and enumerations have been defeated in this tree by an alias, a
// wildcard import and a computed key. The second pattern below matches ANY
// user-defined type-guard signature, so renaming the predicate `ownsAnArtifact`
// and aliasing it back to the conventional name does not escape it — that exact
// bypass is one of the four inputs the DENY half runs, and it was measured to
// pass `tsc` and the census before this check existed.
//
// SCOPED BY BLOCK ROOT, which is what keeps it clean without a suppression. The
// spine's own `isSpineResult` is a legitimate hand-written predicate over a union
// no block owns; it is out of scope BY CONSTRUCTION rather than by exemption,
// because the spine is not a block root. Both roots are read: the port's own
// blocks, and the adopter template's — a template is a block folder like any
// other, and it is the one copy an adopter clones.
//
// AND THE PROSE THAT LANDING FALSIFIED. Deriving the claim made three shipped
// sentences false in the present tense, two of them inside the same paragraph as
// a sentence the landing rewrote. They are pinned below, ORDERED AFTER the
// premise test on purpose: a tree that reverted the derivation must fail on the
// premise — which names the file — rather than policing prose for a property the
// tree no longer earns.

/** A DERIVED claim: the helper applied to the block's own result union. */
const DERIVED_OWNS = /export const is\w+Result = claims</;

/** ANY user-defined type guard, whatever it is called AND however it is
 *  declared. This is the FORM denial: it names no predicate, no result type,
 *  and — after a review shipped an ARROW type guard straight past a version
 *  that required the `function` keyword — no declaration syntax either. The
 *  shape is the return-type annotation itself, `): x is T`, which every
 *  spelling of a user-defined guard must carry; measured false-positive-free
 *  over all live block contracts. */
const HAND_WRITTEN_PREDICATE = /\)\s*:\s*\w+\s+is\s+\w+/;

/** Every directory this repository treats as a block root. The contracts are
 *  READ OFF DISK rather than listed, so a seventh block joins by existing. */
const BLOCK_ROOTS = [
  "examples/typescript/src/blocks",
  "examples/typescript/test/laws/fixtures/quickstart/walk/src/blocks",
] as const;

const blockContracts = BLOCK_ROOTS.flatMap((root) =>
  readdirSync(join(REPO, root))
    .map((block) => join(REPO, root, block, "contract.ts"))
    .filter((full) => existsSync(full))
    .map((full) => ({ path: full.slice(REPO.length + 1), text: readFileSync(full, "utf8") })),
);

/** Every block contract whose ownership claim is not derived — because it does
 *  not use the helper, or because it hand-writes a narrowing predicate anyway. */
export function undrivedOwns(
  files: readonly { readonly path: string; readonly text: string }[],
): readonly string[] {
  return files
    .filter((f) => !DERIVED_OWNS.test(f.text) || HAND_WRITTEN_PREDICATE.test(f.text))
    .map((f) => f.path);
}

/** Sentences the derived-`owns` landing made false in the present tense, each a
 *  literal from the document it was removed from. A revert that puts one back is
 *  a shipped document contradicting its own tree — the failure this file exists
 *  for, in the one shape a count band cannot see. */
const STALE_OWNS_PROSE: readonly { readonly path: string; readonly needle: string }[] = [
  {
    path: "examples/typescript/README.md",
    needle: "hand-kept `is<X>Result` predicate that TypeScript will not check for you",
  },
  {
    path: "wiki/example/06-blocks-and-root.html",
    needle: "where the union is hand-written there is a fifth, unguarded edit (below)",
  },
  {
    path: "wiki/example/06-blocks-and-root.html",
    needle: "The one site the compiler does not name — a real hole, in one of the two ports",
  },
];

describe("every block derives its ownership claim, and no document says otherwise", () => {
  it("reads every block contract on disk, and every one derives its claim", () => {
    // ANTI-VACUITY FIRST. A readdir that had stopped finding contracts would
    // make the assertion under it pass by measuring air — which is exactly how a
    // check in this tree once stayed green over nothing.
    expect(blockContracts.length).toBeGreaterThanOrEqual(7);
    expect(undrivedOwns(blockContracts)).toEqual([]);
  });

  it("DENIES a hand-written predicate — including one RENAMED and correct", () => {
    // The violating half D5 requires, in this file's own in-checker idiom: one
    // checker, several inputs. The third input is the bypass no name list
    // catches — a CORRECT predicate under an unconventional name, aliased back
    // to the conventional one. Measured: it passes `tsc --noEmit` and the
    // ownership census, and is caught by nothing else in either port.
    expect(
      undrivedOwns([
        { path: "a/contract.ts", text: "export const isAResult = claims<AResult>({ x: true });" },
        {
          path: "b/contract.ts",
          text: 'export function isBResult(r: T): r is BResult {\n  return r.tool === "x";\n}',
        },
        {
          path: "c/contract.ts",
          text:
            'export function ownsAC(r: T): r is CResult {\n  return r.tool === "x";\n}\n' +
            "export const isCResult = ownsAC;",
        },
        { path: "d/contract.ts", text: "export type DResult = never;" },
        {
          // THE ARROW SPELLING — a review shipped exactly this past a pattern
          // that required the `function` keyword. Same guard, second syntax.
          path: "f/contract.ts",
          text:
            "export const isFResult = claims<FResult>({ x: true });\n" +
            'export const ownsF = (r: T): r is FResult => r.tool === "x";',
        },
      ]),
    ).toEqual(["b/contract.ts", "c/contract.ts", "d/contract.ts", "f/contract.ts"]);
    // …and the input that ISOLATES the form denial from the name requirement: a
    // contract that DOES derive its claim under the conventional name and hand-
    // writes a narrowing predicate anyway. Only the second pattern sees it. That
    // is what keeps the pair non-redundant rather than one dead regex beside a
    // live one — measured: deleting `HAND_WRITTEN_PREDICATE` turns THIS
    // assertion red and leaves the one above green, and deleting `DERIVED_OWNS`
    // does the opposite by letting `d` (no predicate at all) through.
    expect(
      undrivedOwns([
        {
          path: "e/contract.ts",
          text:
            "export const isEResult = claims<EResult>({ x: true });\n" +
            'export function ownsE(r: T): r is EResult {\n  return r.tool === "x";\n}',
        },
      ]),
    ).toEqual(["e/contract.ts"]);
  });

  it("so NO shipped document may still say that site has no guard", () => {
    const said = STALE_OWNS_PROSE.filter(({ path, needle }) =>
      readFileSync(join(REPO, path), "utf8").includes(needle),
    ).map(({ path, needle }) => `${path}  still states: "${needle}"`);
    expect(said).toEqual([]);
  });
});
