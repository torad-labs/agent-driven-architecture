// ── ONE DEPENDENCY-RULE WORDING, PINNED ───────────────────────────────────
//
// The dependency rule was stated in a different full wording at every site
// that declared it, across the book, the worked example and both ports. Seven
// wordings read as seven rules: a reader who meets two of them cannot tell
// whether they are one law spelled twice or two laws that happen to overlap,
// and the census in `docs/dependency-rule-census.md` shows they had already
// drifted apart in substance — one said "adapters never import each other" and
// another did not mention adapters at all.
//
// So there is ONE canonical sentence, and every site that DECLARES the general
// rule carries it verbatim. This file is the instrument that keeps that true,
// and it holds FIVE distinct claims, because convergence alone is cheap:
//
//   1. CONVERGENCE — the canon is at each declaration site (`SITES`), and at
//      the two ANCHORED regions inside the book rather than merely somewhere
//      in a 2900-line file.
//   2. NO INFLATION — the canon is nowhere else, and nowhere else INSIDE
//      wiki/index.html either. A file-granular count is satisfied by cutting
//      the canon from the G10 row and pasting it into §16.4; the region
//      anchors are not.
//   3. NO RE-DIVERGENCE, honestly scoped — the census pool is pinned per
//      file over whole-file NORMALIZED text, so a new wording IN THE
//      POINT/REACH/DEPEND/LEAK+INWARD SPELLING FAMILY moves an occurrence
//      and goes red, and neither a whitespace reflow nor an append to an
//      already-counted line can pay for one. A competing wording OUTSIDE
//      that family is semantically unclosable by a grep-class instrument;
//      review at the convergence sites owns that residue, and the census
//      note records it.
//   4. THE BOOK'S OWN ARITHMETIC — §7.4's ring counts are DERIVED from §7.4's
//      own table and compared against the numerals §7.4 and §17.6 write in
//      prose. The book has no other check that reads a table it wrote and
//      re-adds it; the first draft of this landing shipped "two of them share
//      the outer ring" over a table with three such rows, and both gates
//      stayed green.
//   5. THE BOOK'S OWN COMPLETENESS CLAIM — the folders §7.5's tree names are
//      checked against the folders §7.4's table names, and §7.4's "partial
//      refinement" paragraph must name every one the table skips. The same
//      first draft claimed the table left nothing to be inferred; §7.5's tree
//      has three top-level folders it never rows and two it never mentions.
//
// WHY A NORMALIZED COMPARE AND NOT A GREP. The same sentence ships in five
// media — HTML prose, an HTML table cell, a Markdown bold span, a `//` comment
// block and a `/** */` comment block — and every one of them wraps it across
// lines and decorates it differently. A line grep sees five sites where there
// are six and cannot see the sixth at all (the eslint banner splits the
// sentence's first clause across two lines). Normalizing markup, comment
// markers and whitespace is what makes "verbatim" a checkable claim rather
// than a hopeful one.
//
// NOT AN INVARIANT, AND DELIBERATELY NOT ON THE ROSTER. This is a convention
// about wording, not one of the sixteen portable laws: it mints no G-id, it is
// absent from `laws.toml`, and it is not a C-check (the registry requires every
// rostered check to trace to a law, and this one traces to none). It is a pin
// test in the same idiom as the citation floors — the cheapest medium that
// fails loudly.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");

/** THE CANONICAL SENTENCE. Owner-approved working text (D7); the owner holds
 *  final wording at review, and changing it means changing it HERE and at
 *  every pinned site in the same diff — which is the entire point of the pin. */
export const CANONICAL =
  "an import may point inward toward the core, or it is the composition root; " +
  "it may never point outward from the core, sideways between adapters, or " +
  "from a passive node — a surface or a tool — into anything but domain types.";

/** The roots a wording claim can be made in. `docs/` is deliberately absent:
 *  the decisions record QUOTES the working text as the decision it is, and a
 *  record of what was decided is not a site that declares the rule. The
 *  repo-root README.md is outside these roots too — measured, it carries no
 *  pool line at all, and D7's scope is the book, the example and code
 *  comments — so a canon pasted there would be invisible here. Recorded in
 *  the census note §7 rather than papered over. */
const ROOTS = ["wiki", "examples"] as const;
/** `.tsbuild` is the TypeScript wall's declaration output: generated,
 *  git-ignored, and named `.d.ts`, which `extname` reads as `.ts`. Same
 *  reason `.work` is here — a generated tree cannot be allowed to move a
 *  pinned census. */
const SKIPPED = [".git", ".gradle", "build", "node_modules", ".work", ".tsbuild"] as const;
/** This checker's own home. It necessarily spells the sentence it pins, so
 *  scanning itself would count the pin as one of the sites it pins. Same
 *  path-scoped exclusion, and same reason, as the citation lint's. */
const SKIPPED_PATHS = ["examples/typescript/test/laws"] as const;
const EXTENSIONS = [".ts", ".kt", ".kts", ".js", ".md", ".html"] as const;

/** Markup, comment furniture and line wrapping removed, so the SENTENCE is
 *  compared and not its typography.
 *
 *  Order matters twice. HTML COMMENTS GO FIRST: `<[^>]+>` matches from `<!--`
 *  straight to the `>` that ends `-->`, so a canon pasted inside a comment
 *  would be swallowed whole and the "nowhere else" claim would be evadable by
 *  commenting the paste out. Markdown emphasis goes before the line-leading
 *  comment strip, or `**an import` at the start of a wrapped line loses a
 *  character to the `*` rule. */
export const normalize = (text: string): string =>
  text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*/g, " ")
    .replace(/^[ \t]*(\/\/|\/\*\*?|\*\/|\*|#)/gm, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

const occurrences = (text: string, needle: string): number => {
  let count = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return count;
};

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if ((SKIPPED as readonly string[]).includes(entry)) continue;
    const full = join(dir, entry);
    const rel = full.slice(REPO.length + 1);
    if (SKIPPED_PATHS.some((skip) => rel === skip || rel.startsWith(`${skip}/`))) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if ((EXTENSIONS as readonly string[]).includes(extname(entry))) out.push(full);
  }
  return out;
}

const needle = normalize(CANONICAL);
const files = ROOTS.flatMap((root) => walk(join(REPO, root), []));
const corpus = files.map((full) => ({
  path: full.slice(REPO.length + 1),
  text: readFileSync(full, "utf8"),
}));
const canonHits = corpus.map((file) => ({
  path: file.path,
  hits: occurrences(normalize(file.text), needle),
}));

const book = readFileSync(join(REPO, "wiki", "index.html"), "utf8");

/** THE DECLARATION SITES, and how many times each declares. Measured on the
 *  landed tree and pinned exactly.
 *
 *  · wiki/index.html twice — §7.6's "THE RULE, IN ONE LINE" note is the canon's
 *    home, and §15.3's G10 row restates it because that table is read on its
 *    own, out of order, as the law register. WHERE those two sit inside the
 *    file is pinned separately below; this count alone is buyable.
 *  · wiki/example/index.html once — "The law, in one sentence", §01.
 *  · each port's README once — the tree diagram's caption, which is the first
 *    statement of the rule a port reader meets.
 *  · each port's gate once — the comment above the check that enforces it, so
 *    the rule and its enforcement are read together. */
const SITES: Record<string, number> = {
  "wiki/index.html": 2,
  "wiki/example/index.html": 1,
  "examples/kotlin/README.md": 1,
  "examples/kotlin/src/test/kotlin/adr/gate/Rules.kt": 1,
  "examples/typescript/README.md": 1,
  "examples/typescript/eslint.config.js": 1,
};

// ── REGION EXTRACTION, so a site is a PLACE and not a file ────────────────

/** The element carrying `id`, open tag to matching close, nesting-aware — a
 *  nested `<div>` must not truncate the region and hand the excluded remainder
 *  a free copy of the canon. Throws rather than returning "" if the anchor is
 *  gone: an extractor that shrugs is a pin that passes on a deleted section. */
function elementById(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) throw new Error(`no element carries id="${id}"`);
  const open = html.lastIndexOf("<", at);
  const tag = /^<([a-z][a-z0-9]*)\b/.exec(html.slice(open, at))?.[1];
  if (tag === undefined) throw new Error(`id="${id}" does not sit on an element open tag`);
  const scan = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  scan.lastIndex = open;
  let depth = 0;
  for (let m = scan.exec(html); m !== null; m = scan.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index + m[0].length);
  }
  throw new Error(`element id="${id}" is never closed`);
}

const cellsOf = (row: string): string[] => row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [];
const rowsOf = (html: string): string[] => html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];

/** The one `<tr>` whose second cell is exactly `name`. Exactly one, or throw —
 *  two matching rows would let one of them lose the canon in silence. */
function rowByName(html: string, name: string): string {
  const hit = rowsOf(html).filter((row) => {
    const cells = cellsOf(row);
    return cells.length > 1 && normalize(cells[1] as string).trim() === name;
  });
  if (hit.length !== 1) throw new Error(`expected 1 <tr> named ${name}, found ${hit.length}`);
  return hit[0] as string;
}

const ruleNote = elementById(book, "the-dependency-rule");
const g10Row = rowByName(book, "dependencies-point-inward");
const bookOutsideAnchors = book.replace(ruleNote, " ").replace(g10Row, " ");

// ── §7.4's RING ARITHMETIC, DERIVED FROM §7.4's OWN TABLE ─────────────────

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven"] as const;
const asWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

/** Every number word in QUANTIFIER position — immediately followed by the
 *  thing it counts, or by "of". That filter is what separates a count claim
 *  ("three share the outer one") from the pronoun in "the outer one", and it
 *  is deliberately grammatical rather than a list of the phrases this landing
 *  happens to have written: insert "four rings" anywhere in a swept region and
 *  the list moves. */
const QUANTIFIED = new RegExp(
  `\\b(${NUMBER_WORDS.join("|")})\\b(?=\\s+(?:of|layers?|rows?|rings?|values?|cuts?|share|straddle|sit)\\b)`,
  "g",
);
const quantifiers = (text: string): string[] =>
  [...normalize(text).matchAll(QUANTIFIED)].map((m) => m[1] as string);

/** §NN, from its own `<h3>` to the next `<h3>` — never a fixed line range. */
function section(html: string, num: string): string {
  const head = `<h3><span class="t">${num}</span>`;
  const at = html.indexOf(head);
  if (at === -1) throw new Error(`no section head for §${num}`);
  const next = html.indexOf('<h3><span class="t">', at + head.length);
  return html.slice(at, next === -1 ? html.length : next);
}

const s74 = section(book, "7.4");
const s176 = section(book, "17.6");

const s74Bodies = s74.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? [];
const s74Rows = rowsOf(s74Bodies[0] ?? "");
/** Column 2 is the Ring column. A row is WHOLLY in a ring when its cell is
 *  exactly a ring name; anything else is a straddle and must name at least
 *  two rings, which is asserted rather than assumed. */
const RING_NAMES = ["inner", "middle", "outer"] as const;
const ringCells = s74Rows.map((row) => normalize(cellsOf(row)[1] ?? "").trim());
const wholly = ringCells.filter((c) => (RING_NAMES as readonly string[]).includes(c));
const straddling = ringCells.filter((c) => !(RING_NAMES as readonly string[]).includes(c));
const whollyOuter = wholly.filter((c) => c === "outer").length;

/** The one §7.4 paragraph that states the counts, and the one §17.6 row that
 *  restates them. Exactly one each — a second copy is exactly the divergence
 *  this file exists to deny. */
const paragraphs = (html: string): string[] => html.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? [];
const s74CountParagraphs = paragraphs(s74).filter((p) => /straddle/.test(normalize(p)));
const s176StraddleRows = rowsOf(s176).filter((r) => /straddle/.test(normalize(r)));
const s176RingRows = rowsOf(s176).filter((r) => /values, fixed/.test(normalize(r)));

/** §7.5's tree, top level only, against the layer table's own text. A folder
 *  is UNROWED when the table never names it at all — `tools/` is rowed in this
 *  sense even though it has no row, because the `agent` row names it and gives
 *  it a ring. §7.4's "partial refinement" paragraph has to name every unrowed
 *  folder, or it is claiming a completeness it does not have: that is the exact
 *  false claim this landing had to delete, so it is derived here rather than
 *  re-asserted in prose. */
const treeFolders = [
  ...section(book, "7.5")
    .replace(/<[^>]+>/g, "")
    .matchAll(/^(?:├──|└──) ([a-z]+)\//gm),
].map((m) => m[1] as string);
const tableText = normalize(s74Bodies[0] ?? "");
const unrowed = treeFolders.filter((f) => !new RegExp(`\\b${f}\\b`).test(tableText));
const partialParagraphs = paragraphs(s74).filter((p) => /partial<\/em> refinement/.test(p));

// ── §7.8's BLOCK TREE, against the rule §4.6 states in prose ──────────────
//
// §4.6 says the block/leaf pair is UNCONDITIONAL and the ratified module DAG
// agrees — every block gets a leaf, empty where it has no seam. §7.8's tree is
// the same rule drawn, and it drew the leaf under two of the four blocks it
// draws, under a header making the second unit conditional on the seam. Two
// sections of one document stating a rule and its negation is a document-level
// defect no section-local read catches, and this section had NO mechanical
// owner at all: reinstating the pre-split spelling left the whole gate green.
//
// This file already owns §7.5's tree and §7.4's arithmetic, so the derivation
// lives beside them rather than in a second detector at the same layer.
const s78Tree = (() => {
  const s78 = section(book, "7.8");
  const start = s78.indexOf("├── blocks/");
  const end = s78.indexOf("└── app/", start);
  if (start === -1 || end === -1) {
    throw new Error("§7.8's block tree no longer runs from `blocks/` to `app/`");
  }
  return s78.slice(start, end);
})();
/** The blocks the tree DRAWS — one level under `blocks/`, trailing slash. */
const s78Blocks = [...s78Tree.matchAll(/^│ {3}[├└]── (\w+)\//gm)].map((m) => m[1] as string);
/** WHICH block each adapter leaf hangs under, not how many there are.
 *
 *  Two independent totals were the defect: a reviewer drew four blocks and four
 *  `adapter/` leaves with two of them under ONE block and the wall stayed green,
 *  because it only ever compared `leaves === blocks.length`. The pair is drawn
 *  as ASSOCIATIONS now — the block whose subtree a leaf sits in — so a leaf that
 *  moves is a red diff even when the arithmetic still balances. */
const s78Owners = (() => {
  const owners: string[] = [];
  let current: string | null = null;
  for (const line of s78Tree.split("\n")) {
    const block = /^│ {3}[├└]── (\w+)\//.exec(line);
    if (block !== null) {
      current = block[1] as string;
      continue;
    }
    if (/└── adapter\//.test(line) && current !== null) owners.push(current);
  }
  return owners;
})();

// ── RE-DIVERGENCE: the census pool, pinned per file ───────────────────────

/** The census walk from `docs/dependency-rule-census.md`, moved here so its
 *  numbers cannot rot unnoticed in a markdown note. The WHOLE file is
 *  normalized first — markup, comment markers, wrapping — and OCCURRENCES are
 *  counted in the normalized text, never physical lines: adversarial review
 *  proved a line count is purchasable in both directions (a whitespace reflow
 *  re-admitted a deleted wording at zero delta, and a second statement
 *  appended to an already-counted line was free). Pinned as a per-file
 *  EQUALITY. HONEST SCOPE: this pin holds the point/reach/depend/leak +
 *  inward spelling FAMILY — the family every wording in the census used. A
 *  competing declaration worded outside that family is semantically
 *  unclosable by any grep-class instrument and is owned by review discipline
 *  at the six convergence sites, not by this wall. */
const DIVERGENCE = /(point\w*|leak\w*|reach\w*|depend\w*)\s+(inward|in)\b/gi;
const poolHits = (text: string): number => [...normalize(text).matchAll(DIVERGENCE)].length;

const POOL: Record<string, number> = {
  "examples/kotlin/README.md": 3,
  "examples/kotlin/spine/src/main/kotlin/adr/spine/ports/ModelProvider.kt": 1,
  "examples/kotlin/src/test/fixtures/konsist/compliant/C1/blocks/triage/Fold.kt": 1,
  "examples/kotlin/src/test/kotlin/adr/gate/GateTest.kt": 1,
  "examples/kotlin/src/test/kotlin/adr/gate/Rules.kt": 2,
  "examples/typescript/README.md": 3,
  "examples/typescript/eslint.config.js": 2,
  "wiki/example/01-state-and-fold.html": 2,
  "wiki/example/02-the-boundary.html": 2,
  "wiki/example/03-tools-and-context.html": 2,
  "wiki/example/04-projection-and-surface.html": 1,
  "wiki/example/05-ports-and-swap.html": 2,
  "wiki/example/06-blocks-and-root.html": 2,
  "wiki/example/07-replay-and-advanced.html": 5,
  // 7 under occurrence-counting: its "law, in one sentence" line states the
  // family twice; the old per-line count saw one.
  "wiki/example/index.html": 7,
  "wiki/index.html": 8,
};

const livePool = Object.fromEntries(
  corpus.map((f) => [f.path, poolHits(f.text)]).filter(([, n]) => (n as number) > 0),
);

describe("one dependency-rule wording", () => {
  it("scans a corpus that cannot quietly shrink", () => {
    expect([...ROOTS]).toEqual(["wiki", "examples"]);
    expect([...SKIPPED]).toEqual([".git", ".gradle", "build", "node_modules", ".work", ".tsbuild"]);
    expect([...SKIPPED_PATHS]).toEqual(["examples/typescript/test/laws"]);
    expect([...EXTENSIONS]).toEqual([".ts", ".kt", ".kts", ".js", ".md", ".html"]);
    expect(corpus.length).toBeGreaterThanOrEqual(300);
  });

  it("PINS THE SENTENCE — a reworded canon is a visible diff, not a silence", () => {
    expect(CANONICAL).toBe(
      "an import may point inward toward the core, or it is the composition root; " +
        "it may never point outward from the core, sideways between adapters, or " +
        "from a passive node — a surface or a tool — into anything but domain types.",
    );
  });

  it("normalizes markup, comment markers and wrapping — else `verbatim` is unprovable", () => {
    expect(normalize("<p>An <em>import</em> may</p>")).toBe(" an import may ");
    expect(normalize("  // an import\n  // may point")).toBe(" an import may point");
    expect(normalize("  *  an import\n  *  may point")).toBe(" an import may point");
    expect(normalize("**an import** may")).toBe(" an import may");
  });

  it("strips HTML comments FIRST — a commented-out paste is still a paste", () => {
    expect(normalize("a <!-- x --> b")).toBe("a b");
    expect(normalize("a <!-- <em>x</em> --> b")).toBe("a b");
    expect(normalize(`<!-- ${CANONICAL} -->`)).not.toContain(needle);
    // and the strip must not eat a legitimate spelling that merely opens with `<`
    expect(normalize(`<p>${CANONICAL}</p>`)).toContain(needle);
  });

  it("matches the canon in every medium it actually ships in", () => {
    const media = [
      `<p>An <em>import</em> may point inward toward the core, or it is the composition root; it may never point outward from the core, sideways between adapters, or from a passive node &mdash; a surface or a tool &mdash; into anything but domain types.</p>`,
      `<td><a class="x" href="#y">The dependency rule</a>, in its canonical wording: an <code>import</code> may point inward toward the core, or it is the composition root;\nit may never point outward from the core, sideways between adapters, or from a passive node — a surface or a tool — into anything but domain types.</td>`,
      `wording: **an import may point inward toward the core, or it is the composition root; it may never\npoint outward from the core, sideways between adapters, or from a passive node — a surface or a\ntool — into anything but domain types.**`,
      `    // types. An\n    // import may point inward toward the core, or it is the composition root;\n    // it may never point outward from the core, sideways between adapters, or\n    // from a passive node — a surface or a tool — into anything but domain\n    // types.`,
      `/** C1 — An import may\n *  point inward toward the core, or it is the composition root; it may never\n *  point outward from the core, sideways between adapters, or from a passive\n *  node — a surface or a tool — into anything but domain types. */`,
    ];
    expect(media.map((m) => occurrences(normalize(m), needle))).toEqual([1, 1, 1, 1, 1]);
  });

  it("carries the canonical sentence verbatim at every declaration site", () => {
    const found = Object.fromEntries(
      Object.keys(SITES).map((path) => [path, canonHits.find((f) => f.path === path)?.hits ?? 0]),
    );
    expect(found).toEqual(SITES);
  });

  it("and states it NOWHERE else — the paste that would fake convergence", () => {
    const stated = canonHits
      .filter((file) => file.hits > 0)
      .map((file) => file.path)
      .sort();
    expect(stated).toEqual(Object.keys(SITES).sort());
  });

  it("holds the book's two copies at their ANCHORS, not merely in the file", () => {
    // A file-granular count is bought by cutting the canon out of the G10 row
    // and pasting it into §16.4: same file, same total. These three numbers
    // are not.
    expect({
      ruleNote: occurrences(normalize(ruleNote), needle),
      g10Row: occurrences(normalize(g10Row), needle),
      elsewhereInTheBook: occurrences(normalize(bookOutsideAnchors), needle),
    }).toEqual({ ruleNote: 1, g10Row: 1, elsewhereInTheBook: 0 });
  });

  it("§7.4's ring counts are DERIVED from §7.4's table, never asserted beside it", () => {
    expect(s74Bodies.length).toBe(1);
    expect(s74Rows.length).toBeGreaterThan(0);
    // the partition is real: every wholly-in cell is a ring name, every
    // straddling cell names at least two, and the three names are the only ones
    expect(wholly.length + straddling.length).toBe(s74Rows.length);
    for (const cell of straddling) {
      expect(RING_NAMES.filter((r) => cell.includes(r)).length).toBeGreaterThanOrEqual(2);
    }
    const named = new Set(RING_NAMES.filter((r) => ringCells.some((c) => c.includes(r))));
    expect([...named].sort()).toEqual([...RING_NAMES].sort());
    // and the derivation itself, so a re-cut table is a visible diff
    expect({
      layers: s74Rows.map((row) => normalize(cellsOf(row)[0] ?? "").trim()),
      wholly: wholly.length,
      straddling: straddling.length,
      whollyOuter,
    }).toEqual({
      layers: ["core / domain", "inference", "sensing", "agent", "surface"],
      wholly: 3,
      straddling: 2,
      whollyOuter: 3,
    });
  });

  it("and the prose that re-states them agrees, in BOTH sections", () => {
    expect(s74CountParagraphs.length).toBe(1);
    expect(s176StraddleRows.length).toBe(1);
    expect(s176RingRows.length).toBe(1);
    expect({
      "§7.4 count paragraph": quantifiers(s74CountParagraphs[0] as string),
      "§17.6 layer row": quantifiers(s176StraddleRows[0] as string),
      "§17.6 ring row": quantifiers(s176RingRows[0] as string),
    }).toEqual({
      // "the five layers … two of its rows straddle … three of them share"
      "§7.4 count paragraph": [
        asWord(s74Rows.length),
        asWord(straddling.length),
        asWord(whollyOuter),
      ],
      // "two layers straddle a ring, three share the outer one"
      "§17.6 layer row": [asWord(straddling.length), asWord(whollyOuter)],
      // "three values, fixed"
      "§17.6 ring row": [asWord(RING_NAMES.length)],
    });
  });

  it("§7.4 claims a PARTIAL refinement, and names every folder its table skips", () => {
    expect(treeFolders).toEqual([
      "domain",
      "tools",
      "agent",
      "inference",
      "sensing",
      "persistence",
      "surface",
      "app",
    ]);
    expect(unrowed).toEqual(["persistence", "app"]);
    expect(partialParagraphs.length).toBe(1);
    const claim = normalize(partialParagraphs[0] as string);
    // it must not re-assert totality …
    expect(claim).toContain("not a total one");
    // … and it must name every folder the table never mentions
    expect(unrowed.filter((f) => new RegExp(`\\b${f}\\b`).test(claim))).toEqual(unrowed);
  });

  it("§7.8 draws the adapter LEAF for every block it draws, and never calls it a file", () => {
    // NAMED first, then equal. An equality alone is satisfied by a tree that
    // stopped matching — 0 leaves under 0 blocks — which is the vacuous-fixture
    // failure this repo has already been bitten by once.
    expect(s78Blocks).toEqual(["triage", "escalation", "console", "artifact"]);
    // ONE leaf under EACH block, by association — not four leaves somewhere.
    expect(s78Owners).toEqual(s78Blocks);
    // and the pre-split spelling the unconditional pair replaced: the leaf is a
    // build unit, not "the only file holding a client".
    expect(s78Tree).not.toMatch(/only (the )?file[^.]{0,40}(holds|holding) a client/i);
  });

  it("RE-DIVERGENCE: the spelling-family pool is pinned per file — a new wording IN the family is red; outside it, review at the convergence sites owns the question", () => {
    expect(livePool).toEqual(POOL);
  });
});
