// ── THE REFERENCE LINT'S OWN BLOCK-TEST AND ALLOW-TEST ────────────────────
//
// §15.2's bar, applied to the citation lint: the pure function in citations.ts
// is run against a checked-in VIOLATING corpus it must reject class by class,
// and a COMPLIANT corpus it must pass in silence. Every rejection below is
// asserted by its own named case against its own specific message — never
// "problems is non-empty" — so weakening one predicate, or deleting one rule,
// goes red on its own and cannot hide behind the other three.
//
// The corpus files carry a `path` chosen HERE rather than their location on
// disk: the function is pure and keys two of its rules on the root a file sits
// in, so the block-test hands it the roots it needs to exercise. The files
// themselves live under test/laws/fixtures/citations/, which tsconfig and biome
// exclude exactly as they exclude test/gate/fixtures.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BARE,
  bookSections,
  CID,
  CODE,
  COMMENT,
  type CorpusFile,
  citationProblems,
  DATA,
  LAW,
  MARKED,
  PROSE,
  RETIRED,
  ROOT_KEYS,
} from "./citations";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");

/** THE SCOPE, PINNED. Narrowing any of these is a diff a reviewer sees. */
const ROOTS = ["examples", "wiki", ".github"] as const;
const EXTRA = ["laws.toml", "README.md"] as const;
const SKIPPED = [
  ".git",
  ".gradle",
  "build",
  "node_modules",
  ".work",
  "package-lock.json",
  "gradle-wrapper.properties",
  "gradlew",
  "gradlew.bat",
] as const;
/** The ONE path-scoped exclusion: the reference lint's own source and corpora
 *  necessarily spell the retired namespace they deny, so scanning them would
 *  make the checker deny itself. Pinned as a literal for exactly that reason. */
const SKIPPED_PATHS = ["examples/typescript/test/laws"] as const;
const EXTENSIONS = [
  ".ts",
  ".kt",
  ".kts",
  ".js",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".html",
  ".toml",
] as const;

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

const liveCorpus: CorpusFile[] = [
  ...ROOTS.flatMap((root) => walk(join(REPO, root), [])),
  ...EXTRA.map((name) => join(REPO, name)),
].map((full) => ({ path: full.slice(REPO.length + 1), text: readFileSync(full, "utf8") }));

const sections = bookSections(readFileSync(join(REPO, "wiki", "index.html"), "utf8"));
const lawIds = new Set(
  [...readFileSync(join(REPO, "laws.toml"), "utf8").matchAll(/^id = "(G\d+)"$/gm)].map(
    (m) => m[1] as string,
  ),
);

const live = citationProblems(liveCorpus, sections, lawIds);

/** Measured on the landed tree and pinned EXACTLY, the roster-pin idiom: any
 *  movement — up or down — is a deliberate one-line diff. A floor over a
 *  growable scalar is purchasable (adversarial review bought a 520-floor with
 *  one junk file of one-G-token-per-line); an equality is not, because
 *  inflation is as red as deletion. PER ROOT, so headroom bought in one root
 *  cannot fund deletions in another. */
const RESOLVABLE_PIN: Record<string, number> = {
  // the Kotlin port carries the heavier banner-comment idiom, so it cites most
  // +1 (529 -> 530): C1's banner in `gate/Rules.kt` grew from one line to five
  // to carry the canonical dependency-rule sentence verbatim (D7). It cited
  // its two section-and-law citations on one line before and on two lines
  // now — one credit became two, with no citation added or removed.
  // +1 (530 -> 531): `Replay.stateAtStep`'s doc comment cites §14.1, the section
  // whose own equation the member is named after. One line, one new citation.
  // +18 (531 -> 549): D20's snapshot half of `spine/replay` — the KDoc banners
  // on Snapshot/RecordMark/Recovery.tailFrom/refoldFrom and their ReplayTest
  // cases all cite §14.1's tagging rule and §14.6. Measured per file by this
  // module's own census, no citation removed.
  "examples/kotlin": 549,
  // a third of the TS files are gate fixture trees that cite far less than
  // the source they stand for
  // +1 (408 -> 409): `stateAtStep`'s doc comment in spine/replay/replay.ts cites
  // §14.1 on the same grounds. No citation was removed in either port.
  // +16 (409 -> 425): the same D20 landing spelled in TS — replay.ts snapshot
  // section + replay.test.ts snapshot describe block, all citing §14.1/§14.6.
  // +1 (425 -> 426): the orchestrator's adjudicated hardening of that landing —
  // the now-half refusal test's comment cites the mutation review proved.
  "examples/typescript": 426,
  // nearly all of it the book's own G-table and cross-references. 137 before
  // §15's inversion merged the separate layer table INTO the invariant table:
  // its sixteen rows were sixteen separately-credited lines and are now the
  // fourth cell of the sixteen rows already counted, so the same sixteen
  // citations sit on half as many lines. No citation was deleted — the G-ids
  // present before and absent after are the empty set.
  wiki: 121,
};
const FILE_PIN: Record<string, number> = {
  "examples/kotlin": 156,
  "examples/typescript": 163,
  wiki: 10,
};

describe("citations resolve — one public namespace", () => {
  it("scans the pinned scope, and the scope cannot quietly shrink", () => {
    expect([...ROOTS]).toEqual(["examples", "wiki", ".github"]);
    expect([...EXTRA]).toEqual(["laws.toml", "README.md"]);
    expect([...SKIPPED_PATHS]).toEqual(["examples/typescript/test/laws"]);
    expect([...SKIPPED]).toEqual([
      ".git",
      ".gradle",
      "build",
      "node_modules",
      ".work",
      "package-lock.json",
      "gradle-wrapper.properties",
      "gradlew",
      "gradlew.bat",
    ]);
    expect([...EXTENSIONS]).toEqual([
      ".ts",
      ".kt",
      ".kts",
      ".js",
      ".json",
      ".yml",
      ".yaml",
      ".md",
      ".html",
      ".toml",
    ]);
    expect(liveCorpus.length).toBeGreaterThanOrEqual(330);
  });

  it("PINS THE PREDICATES — a weakened denial is a visible diff, not a silence", () => {
    expect(RETIRED.source).toBe("\\b[FALD]\\d+\\b");
    expect(MARKED.source).toBe("§\\s?(\\d{1,3}(?:\\.\\d+)*)");
    expect(BARE.source).toBe("(?<![\\w.§])(\\d{1,2}\\.\\d{1,2}(?:\\.\\d+)?)(?!\\d)");
    expect(LAW.source).toBe("\\bG\\d+\\b");
    expect(CID.source).toBe("\\bC(?:1[0-5]|[1-9])\\b");
    expect(COMMENT.source).toBe("^\\s*(\\/\\/|\\/\\*|\\*|#)");
    expect([...CODE]).toEqual([".ts", ".kt", ".kts", ".js", ".yml", ".yaml"]);
    expect([...DATA]).toEqual([".json", ".toml"]);
    expect([...PROSE]).toEqual([".md", ".html"]);
    expect([...ROOT_KEYS]).toEqual(["examples/typescript", "examples/kotlin", "wiki", ".github"]);
    // The law-id set is DERIVED from the registry, never a hard-coded range.
    expect(lawIds.size).toBe(16);
    expect(lawIds.has("G17")).toBe(false);
  });

  it("cites no retired review id anywhere", () => {
    expect(live.retired.map((h) => `${h.where}  ${h.text}`)).toEqual([]);
  });

  it("cites no section the book does not have", () => {
    expect(live.phantomSection.map((h) => `${h.where}  ${h.text}`)).toEqual([]);
  });

  it("cites no law the registry does not carry", () => {
    expect(live.phantomLaw.map((h) => `${h.where}  ${h.text}`)).toEqual([]);
  });

  it("cites no check id as book authority", () => {
    expect(live.bookCid.map((h) => `${h.where}  ${h.text}`)).toEqual([]);
  });

  it("keeps EXACTLY the RESOLVABLE citations the sweep left, PER ROOT", () => {
    // The pin that makes both attacks fail: "delete the comment" drops the
    // count (retiring an id must PRODUCE a public citation, not remove a
    // sentence), and "inflate with a junk citation file" RAISES it — either
    // direction is a red diff a reviewer sees. Editing citations legitimately
    // means updating this pin in the same change, with one line of reasoning.
    for (const [root, pin] of Object.entries(RESOLVABLE_PIN)) {
      expect(live.resolvable[root] ?? 0, `resolvable[${root}]`).toBe(pin);
    }
    for (const [root, pin] of Object.entries(FILE_PIN)) {
      expect(live.files[root] ?? 0, `files[${root}]`).toBe(pin);
    }
  });

  it("the book's own section set parsed — an empty set would pass everything", () => {
    expect(sections.size).toBeGreaterThanOrEqual(100);
    expect(sections.has("15.3")).toBe(true);
    expect(sections.has("14.1.1")).toBe(true);
    expect(sections.has("1.5")).toBe(false);
  });
});

// ── the lint's own BLOCK-TEST and ALLOW-TEST ──────────────────────────────
const corpusFile = (half: string, name: string, path: string): CorpusFile => ({
  path,
  text: readFileSync(join(HERE, "fixtures", "citations", half, name), "utf8"),
});

const violating = citationProblems(
  [
    corpusFile("violating", "code.ts", "examples/typescript/src/violating.ts"),
    corpusFile("violating", "prose.html", "wiki/violating.html"),
    corpusFile("violating", "data.json", "examples/typescript/violating.json"),
  ],
  sections,
  lawIds,
);
const said = (hits: readonly { where: string; text: string }[]) =>
  hits.map((h) => `${h.where}  ${h.text}`).join("\n");

describe("the reference lint DENIES a violating corpus", () => {
  it("REJECTS a retired F id", () => {
    expect(said(violating.retired)).toContain("F9");
  });

  it("REJECTS a retired A id", () => {
    expect(said(violating.retired)).toContain("A4");
  });

  it("REJECTS a retired L id", () => {
    expect(said(violating.retired)).toContain("L3");
  });

  it("REJECTS a retired D id — the COLLIDED namespace", () => {
    // The one that matters most: the same spelling names an unrelated entry in
    // the ratified record, so narrowing the class to [FAL] must go red here.
    expect(said(violating.retired)).toContain("D4");
  });

  it("REJECTS a §-marked section the book does not have", () => {
    expect(said(violating.phantomSection)).toContain("§1.5");
  });

  it("REJECTS a bare section number on a comment line", () => {
    expect(said(violating.phantomSection)).toContain(
      "examples/typescript/src/violating.ts:10  §8.6",
    );
  });

  it("REJECTS a bare section number in a VALUE, where no comment marker is", () => {
    expect(said(violating.phantomSection)).toContain(
      "examples/typescript/src/violating.ts:13  §8.6",
    );
  });

  it("REJECTS a bare section number in a data file, which has no comments at all", () => {
    expect(said(violating.phantomSection)).toContain("examples/typescript/violating.json:2  §8.6");
  });

  it("REJECTS a bare head OUTSIDE the book's range instead of dropping it", () => {
    expect(said(violating.phantomSection)).toContain("§99.9");
  });

  it("REJECTS a G-id the registry does not carry", () => {
    expect(said(violating.phantomLaw)).toContain("G17");
  });

  it("REJECTS a check id cited as authority in the book", () => {
    expect(said(violating.bookCid)).toContain("wiki/violating.html:1  C7");
  });
});

describe("the reference lint ALLOWS a compliant corpus", () => {
  const compliant = citationProblems(
    [
      corpusFile("compliant", "code.ts", "examples/typescript/src/compliant.ts"),
      corpusFile("compliant", "prose.md", "examples/typescript/COMPLIANT.md"),
      corpusFile("compliant", "data.json", "examples/typescript/compliant.json"),
    ],
    sections,
    lawIds,
  );

  it("passes every spelling the sweep introduced, and every near-miss", () => {
    // `G9, 14.1`, `§15.4`, `14.1.1`, `12.4`, `6.8`, a roster row naming C4, a
    // `[C2]` message tag, `node >=14.17`, `Apache-2.0` and `2.5.5`.
    expect(said(compliant.retired)).toBe("");
    expect(said(compliant.phantomSection)).toBe("");
    expect(said(compliant.phantomLaw)).toBe("");
    expect(said(compliant.bookCid)).toBe("");
  });
});
