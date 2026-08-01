// ── THE REFERENCE LINT — one public citation namespace, validated ─────────
//
// The public namespace is fixed at the G-laws plus book section numbers. This
// module is the PURE half: it takes a corpus, the book's own section set and
// the registry's own law-id set, and reports four classes of citation that may
// not ship. Keeping it pure is what lets the same function judge the live tree
// AND a checked-in violating/compliant corpus, so the lint has the block/allow
// pair §15.2 demands of every other check in this repo.
//
// TWO LINTS LIVE HERE, one per coordinate of a reference. `citationProblems`
// below judges a citation's TEXT — the four classes named next. `crossRefProblems`,
// in the second half of this file, judges a LINK: its href and its visible
// label, which are two claims about the same destination and can disagree. Its
// own banner is down there.
//
// THE FOUR DENIED CLASSES OF A CITATION
//
//   1. A RETIRED REVIEW ID — a leading F, A, L or D followed by a number. 525
//      of them shipped, and they were worse than noise: the letter-D namespace
//      COLLIDED. The same spelling meant an invariant in the reference ports
//      and an entirely different, unrelated entry in the ratified decisions
//      record, so a reader who resolved a code citation against that record got
//      a wrong answer every time. They are retired by REWRITING each to its
//      public equivalent, never by deleting the sentence.
//
//   2. A SECTION THE BOOK DOES NOT HAVE — the phantom class. Eleven were live
//      across four non-existent subsections, pointing at text that has never
//      existed. A citation nobody can follow is worse than none: it reads as
//      authority and resolves to nothing. A head outside the book's own range
//      is REPORTED, not silently dropped.
//
//   3. A G-ID OUTSIDE THE REGISTRY. The law-id set is DERIVED from laws.toml,
//      never a hard-coded range, because the two ids anyone is likeliest to
//      write are exactly the two the ratified record refused to mint.
//
//   4. A CHECK ID CITED AS BOOK AUTHORITY. C1–C15 are check-roster internals.
//      Scoped to wiki/ only: the reference ports legitimately carry them in
//      rosters, fixture paths and comments, and the whole swept wiki/ tree
//      measured ZERO, so the rule has no false positives to trade against.
//
// WHERE A BARE `N.N` IS READ, AND WHY NOT EVERYWHERE
//
//   · STRICT — a comment line of a comment-bearing source file: every bare
//     `N.N` must resolve. `// see 99.9 for the rule` is a phantom and is
//     reported as one.
//   · LOOSE — any other line of a source file, and any line of a data file
//     (.json, .toml): a bare `N.N` is read only when it has exactly two
//     components and a head inside the book's 1..18 range. Dependency versions
//     are three-component (`2.4.0`, `1.11.0`, `6.0.208`) and fall outside;
//     measured across the whole tree, this narrowing costs ZERO real citations
//     and admits ZERO version strings. The bound moves WITH the book: the
//     appendix made 18 a real head, and the widening was measured before it
//     landed — no two-component `18.N` exists anywhere in the scanned corpus,
//     so it admits no version string either.
//   · PROSE (.md, .html) — a bare `N.N` is NOT read. Widening it here drowns:
//     `node >=14.17` and `Apache-2.0` are indistinguishable from citations.
//     The sweep therefore writes `§N.N` in prose, and the §-marked form IS read
//     in every file type. This is the one deliberate narrowing in the module
//     and its two arrays are asserted as literals by citations.test.ts.

/** One file of the corpus, keyed by its repo-relative path. */
export interface CorpusFile {
  readonly path: string;
  readonly text: string;
}

export interface Hit {
  readonly where: string;
  readonly text: string;
}

export interface CitationReport {
  readonly retired: Hit[];
  readonly phantomSection: Hit[];
  readonly phantomLaw: Hit[];
  readonly bookCid: Hit[];
  /** Resolvable citations per root — a floor per root, so headroom bought in
   *  one root cannot fund deletions in another. */
  readonly resolvable: Record<string, number>;
  readonly files: Record<string, number>;
}

/** Comment-bearing source files: the STRICT position lives on their comments. */
export const CODE = [".ts", ".kt", ".kts", ".js", ".yml", ".yaml"] as const;
/** Data files with no comment syntax at all — read LOOSE, whole file. */
export const DATA = [".json", ".toml"] as const;
/** Prose and markup — the §-marked form only. */
export const PROSE = [".md", ".html"] as const;

export const COMMENT = /^\s*(\/\/|\/\*|\*|#)/;
export const RETIRED = /\b[FALD]\d+\b/g;
export const MARKED = /§\s?(\d{1,3}(?:\.\d+)*)/g;
export const BARE = /(?<![\w.§])(\d{1,2}\.\d{1,2}(?:\.\d+)?)(?!\d)/g;
export const LAW = /\bG\d+\b/g;
/**
 * THE CHECK-ID NAMESPACE (D30: check ids are roster internals, never book
 * authority). NO CEILING, deliberately: the previous spelling enumerated
 * `C1`-`C15` and stopped covering the namespace the day the roster grew — C16
 * appended to the book read as ordinary prose while C15 one digit away was
 * caught, so the denial had a hole at exactly the id the next landing mints.
 * A bound that has to be edited in step with the roster is a bound that rots,
 * so there is none; citations.test.ts asserts instead that the pattern COVERS
 * every id on the LIVE roster, derived from the shipped eslint config.
 */
export const CID = /\bC\d{1,2}\b/g;

/** The roots the census counts, in the order the floors are pinned. */
export const ROOT_KEYS = ["examples/typescript", "examples/kotlin", "wiki", ".github"] as const;

const ext = (path: string): string => {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot);
};

const rootOf = (path: string): string =>
  ROOT_KEYS.find((root) => path.startsWith(`${root}/`)) ?? "root";

/** A bare number a LOOSE position is willing to read as a citation. */
const looseReadable = (ref: string): boolean => {
  const parts = ref.split(".");
  const head = Number(parts[0]);
  return parts.length === 2 && head >= 1 && head <= 18;
};

export function citationProblems(
  corpus: readonly CorpusFile[],
  sections: ReadonlySet<string>,
  lawIds: ReadonlySet<string>,
): CitationReport {
  const retired: Hit[] = [];
  const phantomSection: Hit[] = [];
  const phantomLaw: Hit[] = [];
  const bookCid: Hit[] = [];
  const resolvable: Record<string, number> = {};
  const files: Record<string, number> = {};

  for (const file of corpus) {
    const suffix = ext(file.path);
    const isCode = (CODE as readonly string[]).includes(suffix);
    const isData = (DATA as readonly string[]).includes(suffix);
    const root = rootOf(file.path);
    files[root] = (files[root] ?? 0) + 1;
    resolvable[root] = resolvable[root] ?? 0;

    file.text.split("\n").forEach((line, index) => {
      const at = `${file.path}:${index + 1}`;
      const strict = isCode && COMMENT.test(line);
      const loose = (isCode && !strict) || isData;
      /** A position the lint can attribute a bare G-token to. A G-token on a
       *  non-comment line of source is a value, not a citation — counting it
       *  is what let `const G1 = …` inflate the floor. */
      const attributable = !(isCode && !strict);

      for (const m of line.matchAll(RETIRED)) retired.push({ where: at, text: m[0] });

      let credited = false;
      for (const m of line.matchAll(LAW)) {
        if (!lawIds.has(m[0])) phantomLaw.push({ where: at, text: m[0] });
        else if (attributable) credited = true;
      }

      if (root === "wiki") {
        for (const m of line.matchAll(CID)) bookCid.push({ where: at, text: m[0] });
      }

      const refs = [...line.matchAll(MARKED)].map((m) => m[1] as string);
      if (strict) {
        refs.push(...[...line.matchAll(BARE)].map((m) => m[1] as string));
      } else if (loose) {
        refs.push(...[...line.matchAll(BARE)].map((m) => m[1] as string).filter(looseReadable));
      }
      for (const ref of refs) {
        if (sections.has(ref)) credited = true;
        else phantomSection.push({ where: at, text: `§${ref}` });
      }

      // ONE CREDIT PER LINE. A line either carries a public citation or it does
      // not; counting tokens rewards stuffing, and a single junk line of ten
      // G-tokens would otherwise buy ten deletions somewhere else.
      if (credited) resolvable[root] = (resolvable[root] ?? 0) + 1;
    });
  }

  return { retired, phantomSection, phantomLaw, bookCid, resolvable, files };
}

/** THE BOOK'S OWN MARKUP, in the two spellings §15.2's conventions fix: a
 *  section head carries a padded `<span class="num">`, a subsection head an
 *  unpadded `<span class="t">`. ONE parser, TWO consumers — `bookSections`
 *  below and the cross-reference resolver further down both read these, so a
 *  markup change cannot move one and leave the other matching nothing. */
export const HEAD = /<span class="num">(\d+)<\/span>/g;
export const SUBHEAD = /<h3><span class="t">([\d.]+)<\/span>/g;

/** The book's own section set: the eighteen heads — seventeen chapters plus the
 *  appendix, which is labelled with a NUMERAL for this reason: the parse below
 *  reads digits, so a letter-labelled appendix would make every reference into
 *  it a phantom — padded in the markup, unpadded in prose (both spellings
 *  resolve), and every subsection head. */
export function bookSections(book: string): Set<string> {
  const sections = new Set<string>();
  for (const m of book.matchAll(HEAD)) {
    sections.add(m[1] as string);
    sections.add(String(Number(m[1])));
  }
  for (const m of book.matchAll(SUBHEAD)) {
    sections.add(m[1] as string);
  }
  return sections;
}

// ── THE CROSS-REFERENCE LINT — a reference has TWO coordinates ─────────────
//
// `citationProblems` above judges a citation's TEXT. A cross-reference in the
// book is not text: it is `<a class="x" href="#anchor">label</a>`, and it makes
// TWO claims at once — the href says where the reader lands, the visible label
// says which section that is. Nothing in this tree read either one. The href was
// guarded by a two-way grep a human ran by hand; the label was guarded by
// nothing at all, and could not be: the PROSE narrowing above deliberately
// refuses to read a bare `N.N` in an `.html` file. MEASURED on this book, 191
// unlinked bare `N.N` sit outside anchors and none of them is a citation — 35
// in the inline stylesheet, the rest `stroke-width:1.5px` in embedded diagram
// source, figure numbers, and a swap-door range. So a label could name a section
// the book does not have, or a different section from the one it links to, and
// both gates stayed green over it.
//
// The POSITION is what makes this readable where free prose is not. Inside
// `<a … href="…">…</a>` a bare number is machine-identifiable as a claim about a
// section; two lines earlier in a stylesheet it is a stroke width. This module
// keys on the STRUCTURAL POSITION and never on the spelling, which is exactly
// the narrowing above, applied rather than undone. `<span class="n">` is read on
// the same grounds: it is the book's own dedicated section-number element inside
// a table-of-contents link, as machine-identifiable as `<span class="num">`.
//
// THE LABEL NAMESPACE IS D30'S. Four label FORMS carry a claim a machine may
// adjudicate — a nav number, a bare section number (with or without the `§` the
// sweep mandates in prose), the `section NN` word form, and a G-id. All four
// name D30's one public namespace: book section numbers plus G-ids. They are not
// a namespace of their own and they are not exhaustive of how that namespace is
// spelled — `citationProblems` above reads the same namespace in every other
// file type, and `§N.N` is the spelling it mandates there.
//
// FIVE DENIED CLASSES
//
//   1. DANGLING — an href whose target page is not in the corpus, or whose
//      fragment is not an `id=` in that page. In-page (`#x`) and cross-file
//      (`index.html#x`, `../index.html`) alike, so the worked example's links up
//      into the book are read on the same footing as the book's own.
//   2. PHANTOM LABEL — a number-form label that is not a section the page it
//      LANDS IN declares. The href may resolve perfectly; the visible text still
//      names a section nobody can find. Scoped per page rather than to one
//      union, because the worked example numbers its own sections 00–05 and
//      those are not the book's.
//   3. NUMBERED DISAGREEMENT — the label's head is not the section number of the
//      id it points at. The id→number map credits an IN-SECTION anchor
//      (`the-dependency-rule`, a note inside §7) to its enclosing section, or
//      three legitimate links would read as defects. A target with NO section
//      number at all is a disagreement too, not an exemption: the label names a
//      book section and the destination is not one.
//   4. WORDED DISAGREEMENT — the same claim spelled `section NN` / `sections
//      NN`. Its own class because its own hits are the ones that were live.
//   5. LAW-LABEL TARGET — a G-id label must land where that law is WRITTEN DOWN,
//      which is a definition and not a mention. Every G-id is discussed in at
//      least two sections of this book, so "the destination's text carries the
//      id" is a sieve: measured, all 49 live law labels could be repointed at a
//      wrong section and stay green under it. The rule reads the DEFINITION
//      CELL instead — a table cell whose entire content is the id — which is a
//      SHAPE derived from the markup, never a hard-coded section number.
//
// THE ONE EXEMPTION, DECLARED: a WHOLE-FILE href (`example/seam.html`, `../
// index.html`) makes no claim about a section, so its label is counted and never
// adjudicated. This is load-bearing rather than cautious: the seven seam pages
// head their parts `▸`, `A`…`E`, which are not digits, so their token sets are
// EMPTY, and the worked example's own nav runs 00–07 over a page numbered 00–05.
// Routing whole-file nav links through the phantom rule manufactures sixty-plus
// false positives against markup that is correct.
//
// AN ABSOLUTE OR PROTOCOL-RELATIVE HREF IS NOT A REPO PATH. `https://…`,
// `mailto:…` and `//host/x` name no corpus page; splicing them through the
// relative-path resolver produces a nonsense path and reports a link that is
// fine as dangling, with no pin to update and no suppression available. They are
// counted in their own bucket and exempted from all five denials. Their LABELS
// still count in the census, so converting internal links into absolute ones
// wholesale is still a visible diff. QUERY STRINGS, stated rather than left
// silent: anything from `?` up to the `#` is stripped before resolving. Zero
// exist today, so either answer was free — the silence is what was forbidden.
//
// WHAT IS DELIBERATELY NOT READ: a prose label. `Fig 7.1`, `the dependency
// rule`, `G1–G16`, `§ mapping` and `seam 07` are English, and an instrument that
// guessed at their intent would be the nuisance 15.2 warns about. They are
// counted, and the count is pinned, so a wholesale conversion of adjudicable
// labels into prose is a red diff rather than a quiet exemption.

/** Every anchor, attributes in ANY order. The book ships one anchor spelled
 *  `<a href="…" class="x">`, so a pattern anchored on `<a class="x" href=`
 *  silently drops it — measured, and the reason this reads `<a` and then looks
 *  for an `href` anywhere in the tag. The body may span lines. */
export const ANCHOR = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
/** Inline markup inside a label — `<code>`, `<em>` — is not part of the claim. */
export const TAGS = /<[^>]*>/g;
export const ELEMENT_ID = /\bid="([^"]+)"/g;
/** The document cut into its sections; `SECTION_TAG` is the flatness probe. */
export const SECTION = /(?=<section\b)/;
export const SECTION_TAG = /<section\b|<\/section\s*>/g;
/** The table-of-contents link's own section-number element, read on the anchor
 *  BODY before `TAGS` flattens it into `05The signed command bus`. */
export const NAV_LABEL = /^\s*<span class="n">(\d+)<\/span>/;
/** The `§` the sweep mandates in prose, stripped so `§04` is read as `04`. */
export const SECTION_SIGN = /^§\s?/;
/** `7`, `7.4`, `14.1.1` — up to three components, because the book links its
 *  own third-level subsections by bare number. */
export const NUMBER_LABEL = /^(\d{1,2})(?:\.\d{1,2}){0,2}$/;
export const WORDED_LABEL = /^sections?\s+(\d{1,2})\b/i;
export const LAW_LABEL = /^G\d+$/;
/** A law's DEFINITION site: a table cell whose entire content is the id. */
export const LAW_CELL = /<td[^>]*>\s*(G\d+)\s*<\/td>/g;
export const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export interface LabelCensus {
  readonly nav: number;
  readonly navWholeFile: number;
  readonly numbered: number;
  readonly worded: number;
  readonly law: number;
  readonly prose: number;
}

export interface CrossRefReport {
  readonly dangling: Hit[];
  readonly phantomLabel: Hit[];
  readonly numberedLabel: Hit[];
  readonly wordedLabel: Hit[];
  readonly lawLabel: Hit[];
  /** THE VACUITY INSTRUMENTS. An empty anchor list or an empty id map passes
   *  every rule above in silence, which is precisely how this class hid. Each
   *  is pinned as an EQUALITY, so inflation is as red as deletion. */
  readonly anchors: number;
  readonly numberedTargets: number;
  /** Adjudicable labels landing on an id that sits in no numbered section.
   *  Zero today — and without this instrument the whole family above can go
   *  silently inert, because `anchors`, `numberedTargets` and `labels` are all
   *  invariant under repointing a label at a numberless id. */
  readonly numberlessTargets: number;
  readonly external: number;
  /** The law-definition cells, and how many sections host them: the law rule's
   *  own vacuity guard, since a markup change that stopped matching cells would
   *  otherwise turn class 5 into a silence. */
  readonly lawDefinitions: number;
  readonly lawDefinitionSections: number;
  /** `SECTION` splits on a lookahead, which assumes sections do not nest. This
   *  is that assumption, measured rather than believed: nest one `<section>`
   *  and the id→number map starts lying with no other test moving. */
  readonly maxSectionDepth: number;
  readonly unbalancedPages: string[];
  readonly labels: LabelCensus;
}

interface Parsed {
  /** every `id=` in the page, mapped to its enclosing section's number, or
   *  `null` where the page or the position carries no number at all. */
  readonly ids: Map<string, string | null>;
  /** the G-ids WRITTEN DOWN in the section an id sits in. */
  readonly defines: Map<string, ReadonlySet<string>>;
  readonly cells: number;
  readonly hostingSections: number;
  readonly depth: number;
  readonly balance: number;
}

const parsePage = (page: CorpusFile): Parsed => {
  const ids = new Map<string, string | null>();
  const defines = new Map<string, ReadonlySet<string>>();
  let cells = 0;
  let hostingSections = 0;
  page.text.split(SECTION).forEach((chunk, index) => {
    const head = [...chunk.matchAll(HEAD)][0];
    // index 0 is everything BEFORE the first section — the nav — and it carries
    // no number even when a head span happens to sit in it.
    const num = index === 0 || head === undefined ? null : String(Number(head[1]));
    // THE HOST IS THE SECTION WITH ITS LINKS REMOVED. Measured: without this, a
    // law label sitting INSIDE the section it points at satisfies the rule with
    // its own text — repointing `G16` at the section that already holds the link
    // stayed green — and a `<td><a>G4</a></td>` cell would define itself.
    const host = chunk.replace(ANCHOR, "");
    const written = new Set<string>();
    for (const m of host.matchAll(LAW_CELL)) {
      written.add(m[1] as string);
      cells += 1;
    }
    if (written.size > 0) hostingSections += 1;
    for (const m of chunk.matchAll(ELEMENT_ID)) {
      const id = m[1] as string;
      ids.set(id, num);
      defines.set(id, written);
    }
  });
  let depth = 0;
  let deepest = 0;
  for (const m of page.text.matchAll(SECTION_TAG)) {
    if (m[0].startsWith("</")) depth -= 1;
    else {
      depth += 1;
      deepest = Math.max(deepest, depth);
    }
  }
  return { ids, defines, cells, hostingSections, depth: deepest, balance: depth };
};

/** What a label CLAIMS, read from its STRUCTURE rather than from a spelling.
 *  `nav` is read on the raw anchor body, before `TAGS` fuses the number into
 *  the title; the other three are read on the flattened label. */
type Claim =
  | { readonly kind: "nav"; readonly token: string; readonly head: string }
  | { readonly kind: "numbered"; readonly token: string; readonly head: string }
  | { readonly kind: "worded"; readonly head: string }
  | { readonly kind: "law" }
  | { readonly kind: "prose" };

const claimOf = (body: string, label: string): Claim => {
  const nav = NAV_LABEL.exec(body);
  if (nav !== null) {
    const token = nav[1] as string;
    return { kind: "nav", token, head: String(Number(token)) };
  }
  const bare = label.replace(SECTION_SIGN, "");
  const numbered = NUMBER_LABEL.exec(bare);
  if (numbered !== null)
    return { kind: "numbered", token: bare, head: String(Number(numbered[1])) };
  const worded = WORDED_LABEL.exec(label);
  if (worded !== null) return { kind: "worded", head: String(Number(worded[1])) };
  if (LAW_LABEL.test(label)) return { kind: "law" };
  return { kind: "prose" };
};

/** `wiki/example/06.html` + `../index.html` -> `wiki/index.html`. Pure: the
 *  corpus is keyed by repo-relative path and never touches the filesystem. */
const resolveFrom = (from: string, rel: string): string => {
  const parts = from.split("/");
  parts.pop();
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
};

export function crossRefProblems(pages: readonly CorpusFile[]): CrossRefReport {
  const dangling: Hit[] = [];
  const phantomLabel: Hit[] = [];
  const numberedLabel: Hit[] = [];
  const wordedLabel: Hit[] = [];
  const lawLabel: Hit[] = [];
  const labels = { nav: 0, navWholeFile: 0, numbered: 0, worded: 0, law: 0, prose: 0 };
  let anchors = 0;
  let numberedTargets = 0;
  let numberlessTargets = 0;
  let external = 0;
  let lawDefinitions = 0;
  let lawDefinitionSections = 0;
  let maxSectionDepth = 0;
  const unbalancedPages: string[] = [];

  const parsed = new Map<string, Parsed>();
  // PER PAGE, not one union. `wiki/example/index.html` numbers its own sections
  // 00–05, a namespace of its own that has nothing to do with the book's; a
  // shared token set would let a label naming one page's section pass while
  // pointing at the other's.
  const tokensOf = new Map<string, ReadonlySet<string>>();
  for (const page of pages) {
    const seen = parsePage(page);
    parsed.set(page.path, seen);
    tokensOf.set(page.path, bookSections(page.text));
    lawDefinitions += seen.cells;
    lawDefinitionSections += seen.hostingSections;
    maxSectionDepth = Math.max(maxSectionDepth, seen.depth);
    if (seen.balance !== 0) unbalancedPages.push(page.path);
    for (const num of seen.ids.values()) if (num !== null) numberedTargets += 1;
  }

  for (const page of pages) {
    for (const m of page.text.matchAll(ANCHOR)) {
      anchors += 1;
      const href = m[1] as string;
      const body = m[2] as string;
      const label = body.replace(TAGS, "").replace(/\s+/g, " ").trim();
      const at = `${page.path}:${page.text.slice(0, m.index ?? 0).split("\n").length}`;
      const said = `${label} -> ${href}`;

      const cut = href.indexOf("#");
      const fragment = cut < 0 ? "" : href.slice(cut + 1);
      const claim = claimOf(body, label);
      // A nav number over a WHOLE-FILE href names a PAGE, not a section, so it
      // gets its own bucket rather than a silent exemption inside `nav`.
      labels[claim.kind === "nav" && fragment === "" ? "navWholeFile" : claim.kind] += 1;

      if (EXTERNAL.test(href)) {
        external += 1;
        continue;
      }
      const before = cut < 0 ? href : href.slice(0, cut);
      const query = before.indexOf("?");
      const file = query < 0 ? before : before.slice(0, query);
      const path = file === "" ? page.path : resolveFrom(page.path, file);
      const target = parsed.get(path);
      const resolved = target !== undefined && (fragment === "" || target.ids.has(fragment));
      if (!resolved) {
        // ONE wrong answer per broken link. Adjudicating the label of an href
        // that lands nowhere is a second, and it is a guess.
        dangling.push({ where: at, text: said });
        continue;
      }
      if (fragment === "") continue;

      const section = target.ids.get(fragment) ?? null;
      if (claim.kind !== "prose" && section === null) numberlessTargets += 1;
      const tokens = tokensOf.get(path) ?? new Set<string>();
      const landed = section === null ? "no section" : `section ${section}`;

      switch (claim.kind) {
        case "nav":
        case "numbered": {
          if (!tokens.has(claim.token)) phantomLabel.push({ where: at, text: said });
          else if (claim.head !== section) {
            numberedLabel.push({ where: at, text: `${said} (= ${landed})` });
          }
          break;
        }
        case "worded": {
          if (claim.head !== section) {
            wordedLabel.push({ where: at, text: `${said} (= ${landed})` });
          }
          break;
        }
        case "law": {
          if (!(target.defines.get(fragment)?.has(label) ?? false)) {
            lawLabel.push({ where: at, text: said });
          }
          break;
        }
        case "prose":
          break;
      }
    }
  }

  return {
    dangling,
    phantomLabel,
    numberedLabel,
    wordedLabel,
    lawLabel,
    anchors,
    numberedTargets,
    numberlessTargets,
    external,
    lawDefinitions,
    lawDefinitionSections,
    maxSectionDepth,
    unbalancedPages,
    labels,
  };
}
