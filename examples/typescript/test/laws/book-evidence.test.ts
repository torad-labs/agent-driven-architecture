// ── THE BOOK STATES ARCHITECTURE; EVIDENCE LIVES BESIDE THE CODE ──────────
//
// docs/DECISIONS.md:142 moved §17.4's exercised/specified table out of the
// book. The ladder stays as architecture; which rungs a codebase has actually
// climbed is that codebase's own claim, made in its own README where a build
// settles it. docs/DECISIONS.md:147 is what makes the move checkable at all:
// any sentence in `wiki/` whose truth depends on the current state of
// `examples/` is a port-fact.
//
// THE MOVE FIRST SHIPPED WITHOUT AN INSTRUMENT, WHICH IS WHY THIS FILE EXISTS.
// The counterexample was not subtle. Restore the removed "EXERCISED VERSUS
// SPECIFIED-BUT-UNPROVEN" note verbatim, flatten its four cross-reference `<a>`
// elements to the bare-number spelling the book already uses elsewhere, and
// every link census in `citations.test.ts` is unchanged to the occurrence while
// the book claims again that every rung "is now exercised by the accompanying
// ports". Three gates green over a complete relapse. Those pins were never
// reading the evidence; they were reading the links that happened to sit inside
// it, and flattening the links is a two-minute edit.
//
// SO THE CENSUS READS THE CLAIM, IN TWO FAMILIES, AND BOTH ARE LOAD-BEARING.
//
//   PORT-FACT — the FORM a port-fact takes rather than a list of names: a
//   REFERENT ("the reference ports", "both ports", "per port", "in-memory
//   adapters", "the accompanying code"), a PATH (`examples/typescript/…`,
//   `.github/workflows/…`), or a TOOL (`npm test`, `./gradlew check`, detekt,
//   vitest, ast-grep, eslint). Enumerating the spellings one removed paragraph
//   happened to use is how a rule gets defeated by the next synonym, so each
//   alternative is a shape with its optional articles and its path tail.
//
//   EVIDENCE-VERDICT — the words a verdict is rendered in at all: "exercised",
//   "partly", "specified but unproven", "proven", "unproven", "demonstrates",
//   "ships", "goes green". This half is what closes the evasion. A relapse
//   worded "every rung is demonstrated by the code that ships alongside this
//   document, and the suites are green" names no port, no path and no tool, and
//   passes the port-fact family with zero hits.
//
// REGION-ANCHORED AS WELL AS WHOLE-FILE. A whole-file count on its own is paid
// for by moving an occurrence in from elsewhere in the same file — the
// NO-INFLATION lesson `dependency-rule.test.ts` already records — so §17.4 is
// sliced out and pinned at its own value with the book's total pinned beside
// it. Neither is an inequality; a relapse that also deletes an unrelated
// sentence to keep the total flat still moves the region.
//
// AND ONE DENIAL THAT IS STRUCTURAL RATHER THAN LEXICAL. §17.4's ladder table
// has THREE columns. The evidence lived in a fourth. A reworded fourth column
// is denied by its shape whatever it manages to say, and that is the only
// assertion here a rewrite cannot argue with.
//
// SCOPED TO wiki/index.html, DELIBERATELY. docs/DECISIONS.md:142 is
// book-scoped; docs/DECISIONS.md:147's sweep is wiki/-scoped and larger.
// `wiki/example/05-ports-and-swap.html`, `06-blocks-and-root.html`,
// `07-replay-and-advanced.html` and `wiki/example/index.html` carry
// pre-existing port-facts that belong to that sweep, not to this file — and one
// of them is a load-bearing needle in `roster-count.test.ts`, so a wiki/-wide
// census landed here would either go red on arrival or force that needle's
// deletion, silently emptying a shipped vacuity roster. Left open on purpose.
//
// HONEST BOUND, in the idiom of `dependency-rule.test.ts`'s census note: a
// grep-class instrument over prose cannot close a claim tipped by a word in
// NEITHER family, and review at §17.4 owns that residue. What IS closed is the
// class the counterexamples came from — every referent, path and tool spelling
// the removed text used, every verdict word it rendered, and the table shape no
// wording can route around.
//
// NOT AN INVARIANT, AND DELIBERATELY NOT ON THE ROSTER, exactly as
// `dependency-rule.test.ts` declares itself: this mints no G-id, adds no
// `laws.toml` row, is not a rostered check (the registry requires every one to
// trace to a law, and this traces to none) and does not move the roster's N.
// It is a pin test in the citation-floor idiom — the cheapest medium that fails
// loudly.
//
// WHY IT LIVES HERE. `test/laws` is the ONE citation-exempt path
// (`SKIPPED_PATHS` in `citations.test.ts`) and `test/laws/fixtures` is skipped
// by roster-count's walker, so neither this file nor its fixtures can move a
// per-root citation pin or join the roster corpus. The price is that the
// citation lint cannot SEE this file: the retired-namespace law still binds
// here, and every reference above is hand-written as `docs/DECISIONS.md:<line>`
// for that reason.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");

/** A port-fact by FORM: a referent, a repo path, or a tool invocation. */
const PORT_FACT =
  /(?:the |both |these |two |accompanying |its )?reference (?:port|implementation)s?|(?:the |both |these |accompanying )ports\b|\bper port\b|in-memory adapters|the accompanying (?:code|ports)|examples\/(?:typescript|kotlin)[\w/.\-]*|npm\s+(?:&nbsp;)?test|npm run [\w:]+|\.\/?gradlew(?:&nbsp;)?\s*\w*|\.github\/workflows[\w/.\-]*|\bdetekt\b|\bvitest\b|\bast-grep\b|\beslint\b/gi;

/** The vocabulary a verdict about an implementation is rendered in. Catches
 *  the evasive relapse that names no port, no path and no tool. */
const EVIDENCE_VERDICT =
  /\bexercised\b|\bpartly\b|specified[- ]but[- ]unproven|\bproven\b|\bunproven\b|\bdemonstrat\w+|the suites are green|goes green|\bship(?:s|ped)?\b/gi;

const book = readFileSync(join(REPO, "wiki", "index.html"), "utf8");
const overview = readFileSync(join(REPO, "wiki", "example", "index.html"), "utf8");

/** §17.4, sliced head-to-head so a relapse cannot pay for itself elsewhere. */
function region(): string {
  const from = book.indexOf('<span class="t">17.4');
  const to = book.indexOf('<span class="t">17.5', from);
  if (from < 0 || to < 0) throw new Error("§17.4 is no longer anchorable in wiki/index.html");
  return book.slice(from, to);
}

const hits = (text: string, family: RegExp): number => (text.match(family) ?? []).length;

function fixture(name: string): string {
  return readFileSync(join(HERE, "fixtures", "book-evidence", `${name}.html`), "utf8").trim();
}

describe("wiki/index.html states architecture, never evidence about a port", () => {
  it("the region anchor still resolves — the slice is not silently empty", () => {
    expect(region().length).toBeGreaterThan(2000);
    expect(region()).toContain("Minimum-viable versus full adoption");
  });

  it("§17.4 carries ZERO port-facts", () => {
    expect(hits(region(), PORT_FACT)).toBe(0);
  });

  it("§17.4 matches its checked-in golden BYTE FOR BYTE — the structural wall", () => {
    // Three reviewers each restored the removed evidence claim in a wording
    // the two regex families do not spell — "walked end to end by the two
    // implementations", "WHERE THE LADDER STANDS TODAY", "never goes red" —
    // and every lexical census stayed green. A vocabulary can always be
    // out-worded; a byte pin cannot. This is §15.3's own idiom (generated
    // tables asserted byte-for-byte): §17.4 is short and now fully
    // architecture, so ANY edit to it is a deliberate act that updates the
    // golden in the same diff, with the diff itself as the review surface.
    // The two regex censuses stay as the cheap second layer and as the wall
    // for the REST of the book, which a golden this narrow cannot see.
    expect(region()).toBe(
      readFileSync(join(HERE, "fixtures", "book-evidence", "region.golden.html"), "utf8"),
    );
  });

  it("the whole book's port-fact census is pinned EXACTLY", () => {
    // 23 before the move, 16 after. Every one of the sixteen survivors is
    // outside §17.4 and predates it; this pin exists so a relapse cannot be
    // paid for by deleting a port-fact from some other section.
    // 16 -> 18: the blast-radius rewrite adds two, both DEFLECTIONS — "how a
    // port counts that edit is a fact about the port, and each reference port's
    // README states it" — the same pointing-away idiom the survivors use. The
    // census counts mentions, not violations; what it exists to catch is the
    // count moving WITHOUT a reason beside it.
    expect(hits(book, PORT_FACT)).toBe(18);
  });

  it("the evidence-verdict census is pinned EXACTLY, region and whole book", () => {
    // Region 19 -> 4. The four survivors are architecture, not verdicts: "goes
    // green" and "demonstrates" in the sentence saying where evidence belongs,
    // "demonstrated" in the 16.4 qualifier, and "ship" in the closing "ship
    // something replayable in a day". Whole book 46 -> 31.
    expect(hits(region(), EVIDENCE_VERDICT)).toBe(4);
    expect(hits(book, EVIDENCE_VERDICT)).toBe(31);
  });

  it("§17.4's ladder table has THREE columns — the evidence column cannot return", () => {
    const r = region();
    expect(hits(r, /<th>/g)).toBe(3);
    const rows = [...r.matchAll(/<tr><td>(.*?)<\/tr>/g)].map((m) => m[0]);
    expect(rows.length).toBe(6);
    for (const row of rows) expect(hits(row, /<td/g)).toBe(3);
  });

  it("DENIES the real removed text and ALLOWS the landed replacement", () => {
    // The violating fixture is not synthetic. It is the removed note VERBATIM,
    // with only its four cross-reference <a> elements flattened to bare numbers
    // — i.e. exactly the relapse that used to land green. A fixture invented by
    // hand goes vacuous the day someone rewords the paragraph; this one cannot.
    const violating = fixture("violating");
    expect(hits(violating, PORT_FACT)).toBe(4);
    expect(hits(violating, EVIDENCE_VERDICT)).toBe(10);
    expect(book).not.toContain(violating);

    // The compliant fixture is the landed architecture note, and it is asserted
    // to be a byte SUBSTRING of the live §17.4 — so it cannot drift away from
    // the idiom it stands for. It legitimately says "gate-checkable", "no
    // enforcement layer can hold it", "structural, not gate-checkable" and "a
    // rung someone has demonstrated", and carries the 16.4 link; a rule that
    // reddened any of those would be a false positive, and this is the half
    // that proves it does not.
    const compliant = fixture("compliant");
    expect(region()).toContain(compliant);
    for (const phrase of [
      "gate-checkable",
      "no</em> enforcement layer can hold it",
      "structural, not gate-checkable",
      "a rung someone has demonstrated",
      '<a class="x" href="#payoff-and-non-goals">16.4</a>',
    ]) {
      expect(compliant).toContain(phrase);
    }
    expect(hits(compliant, PORT_FACT)).toBe(0);
    expect(hits(compliant, EVIDENCE_VERDICT)).toBe(3);
  });
});

// ── THE WALKTHROUGH'S OWN DISCLAIMER MUST NOT OVERCLAIM EITHER ────────────
//
// The same move gave `wiki/example/index.html` a rung-to-seam map, and the
// first draft of its closing note said no assertion on those pages could go
// red. That is false on the tree it shipped into: `roster-count.test.ts` names
// `wiki/example/07-replay-and-advanced.html` in its vacuity roster, so a wrong
// count on that page reddens a shipped assertion. A page-level infallibility
// claim is a port-fact wearing a modest hat — it asserts something about what
// the build does — and it is denied here in any spelling.
//
// The REQUIRE half is not decoration. A deny-only rule is satisfied by deleting
// the paragraph, which would lose the honest disclaimer docs/DECISIONS.md:142
// wants the example to carry; so the corrected, listing-scoped form is pinned
// present as well.
describe("the worked example's disclaimer is listing-scoped, not page-scoped", () => {
  // THE FORM, NOT FOUR SENTENCES. A reviewer out-worded the enumerated list
  // with "nothing on this page ever goes red" — singular referent, adverb the
  // list did not spell. The denial is composed of shape slots now, the way
  // PORT_FACT and EVIDENCE_VERDICT above already are: a PAGE REFERENT (any
  // determiner, singular or plural, with or without a "nothing on" prefix),
  // a bounded gap, and an INFALLIBILITY PREDICATE (goes red / fail / break /
  // claim nothing / cannot-be-wrong, under any modal or adverb).
  const PAGE_REFERENT = String.raw`(?:this|these|the|any|those)\s+pages?\b`;
  const INFALLIBLE = new RegExp(
    String.raw`(?:\bno(?:thing|ne)?\b[^.<]{0,60})?(?:\bon\s+)?${PAGE_REFERENT}[^.<]{0,80}` +
      String.raw`(?:go(?:es)?\s+red|fail(?:s|ed)?\b|break(?:s)?\b|claims?\s+nothing|` +
      String.raw`(?:never|cannot|can't|could\s+not)\s+(?:be\s+)?(?:wrong|red|fail))`,
    "i",
  );

  it("makes no page-level infallibility claim, in any spelling of the form", () => {
    expect(overview.match(INFALLIBLE)).toBeNull();
  });

  it("DENIES the reviewer's own out-wording — the form is not vacuous", () => {
    const planted = overview.replace(
      "None of these listings compiles, and nothing on this page is executed by any build.",
      "None of these listings compiles, and nothing on this page ever goes red.",
    );
    expect(planted).not.toBe(overview);
    expect(planted.match(INFALLIBLE)).not.toBeNull();
    // And the enumerated relapse it was built to deny still fails too.
    expect("no assertion on these pages can go red".match(INFALLIBLE)).not.toBeNull();
  });

  it("still carries the honest, listing-scoped disclaimer", () => {
    expect(overview).toContain("None of these listings compiles");
    expect(overview).toContain("that implementation's own build is what keeps the number honest");
  });
});
