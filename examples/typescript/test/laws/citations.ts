// ── THE REFERENCE LINT — one public citation namespace, validated ─────────
//
// The public namespace is fixed at the G-laws plus book section numbers. This
// module is the PURE half: it takes a corpus, the book's own section set and
// the registry's own law-id set, and reports four classes of citation that may
// not ship. Keeping it pure is what lets the same function judge the live tree
// AND a checked-in violating/compliant corpus, so the lint has the block/allow
// pair §15.2 demands of every other check in this repo.
//
// THE FOUR DENIED CLASSES
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
//     components and a head inside the book's 1..17 range. Dependency versions
//     are three-component (`2.4.0`, `1.11.0`, `6.0.208`) and fall outside;
//     measured across the whole tree, this narrowing costs ZERO real citations
//     and admits ZERO version strings.
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
export const CID = /\bC(?:1[0-5]|[1-9])\b/g;

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
  return parts.length === 2 && head >= 1 && head <= 17;
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

/** The book's own section set: the seventeen heads (padded in the markup,
 *  unpadded in prose — both spellings resolve) and every subsection head. */
export function bookSections(book: string): Set<string> {
  const sections = new Set<string>();
  for (const m of book.matchAll(/<span class="num">(\d+)<\/span>/g)) {
    sections.add(m[1] as string);
    sections.add(String(Number(m[1])));
  }
  for (const m of book.matchAll(/<h3><span class="t">([\d.]+)<\/span>/g)) {
    sections.add(m[1] as string);
  }
  return sections;
}
