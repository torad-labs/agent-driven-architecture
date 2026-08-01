// ── THE BOOK FIXES A VOCABULARY, AND A FIXED NAME CAN GO STALE SILENTLY ───
//
// §17.6 is the one place the architecture states its names. Adding the
// architecture-level shapes the reference ports actually declare (the fold's
// return, a fold arm's return, a block's registration, a block's effect table,
// an effect's class) makes that table load-bearing in a way it was not before:
// a row can be deleted, a name can be stated twice in two different words, and
// a role whose two accepted spellings differ can quietly be collapsed to one
// canonical word that half the world cannot honor. None of those three shows up
// in any gate — each port's check roster reads Kotlin and TypeScript trees, never
// HTML — and none shows up in a raw token count either, which is purchasable by
// any `<code>` added anywhere in the section.
//
// So this is a DERIVATION over the table, in record-shape.test.ts's shape:
// locate §17.6's table, read each row's own `<code>` tokens, and judge the row
// each fixed name lands in. Three claims, none of them a count:
//
//   1. EVERY FIXED NAME IS STATED, IN EXACTLY ONE ROW. A name in no row is a
//      deletion; a name in two rows is the document saying one thing two ways,
//      which is precisely how §14.1 came to mandate an envelope §14.6's sketch
//      six lines earlier did not show.
//   2. A NAME WITH SEVERAL ACCEPTED SPELLINGS CARRIES ALL OF THEM IN ITS ROW.
//      Effect performance is registered per block under two spellings that are
//      both correct and are NOT interchangeable text — one is a per-kind
//      function gathered into a mapped table, the other one value per block
//      that narrows then performs. A row naming one of them alone reads as a
//      rename of the other, and the ratified record forbids renames here.
//   3. WHAT A NAME CANNOT STAND WITHOUT RIDES ITS OWN ROW. The fold's return
//      is a named type where the language names types and an unnamed pair where
//      it does not, so the SHAPE is what both honor and may never be dropped in
//      favour of the name alone; an enumeration's values are the same case one
//      level down — `EffectClass` with `Routine` and `Irreversible` moved into
//      a neighbouring row still reads as a complete table to any count, and to
//      a reader it reads as a name with nothing behind it.
//
// IT READS `wiki/` AND NOTHING ELSE, deliberately. Judging these rows against
// the reference ports' current source would make the book depend on the
// example, which is the coupling the ratified record removes; the table is
// PRESCRIPTIVE, and a port that has not caught up is the port's finding, not
// the book's. The per-port spellings live in the two ports' READMEs.
//
// THE NEGATIVE HALF IS BUILT FROM THE SHIPPED BOOK, never from a hand-written
// miniature — laws.test.ts's rule, and for its reason: a fixture that stopped
// standing for the live markup passes over nothing, and this repository has
// been bitten by exactly that. Each planting below mutates the real table, and
// each must be reported — or, for the two cases that pin a NON-report, must
// leave every structural claim standing while still being a real mutation.
//
// WHERE IT LIVES. test/laws is the one citation-exempt path, so a document
// check here adds no citation credit and cannot move a pinned census.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");
const BOOK = join(REPO, "wiki", "index.html");

/** The table's own head, in the book's fixed subsection markup. */
const SUBHEAD = '<h3><span class="t">17.6</span>';
/** THE FORM OF A ROW TAG, not one spelling of it — an attributed `<tr class>`
 *  is still a row the reader sees, so it is a row this derivation judges. */
const ROW = /<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/g;
/** THE FORM OF A CODE TAG, not one spelling of it. Measured on the book this
 *  landed on: 218 bare `<code>` against 511 classed — 281 `<code class="i">`,
 *  204 `<code class="k">` and 26 `<code class="language-plaintext">` — so an
 *  enumerated open tag is blind to the book's own DOMINANT idiom, and a name
 *  added in it would move no census at all. */
const CODE = /<code(?:\s[^>]*)?>([^<]*)<\/code>/g;
/** A token that NAMES a type rather than writing a shape or a call: upper
 *  camel, optionally generic. Keyed on the FORM of a type parameter rather
 *  than on the two letters in use today. This is an IMPROVEMENT, not the
 *  closure: a multi-parameter generic (`Lens<S, T>`) still escapes it, and
 *  what actually backstops that is the listed token census below, which is
 *  form-agnostic. Widening it costs nothing today — measured on the landed
 *  table, the set of tokens this form admits and the old `<S>`/`<E>` form did
 *  not is empty. */
const TYPE_NAME = /^[A-Z][A-Za-z]*(?:&lt;[A-Z][A-Za-z]*&gt;)?$/;

/** EVERY table body inside §17.6, concatenated, or a throw. A locator that
 *  shrugs is a check that passes on a deleted section — and a locator that
 *  reads only the FIRST table is a check a reviewer defeated by planting a
 *  SECOND one after it, restating a fixed name in markup the reader sees and
 *  the derivation never did. The scope is the SUBSECTION (head to next head),
 *  so anything a reader would take as §17.6's vocabulary is judged as it. */
function tableBody(book: string): string {
  const head = book.indexOf(SUBHEAD);
  if (head < 0) throw new Error("the book carries no §17.6 subsection head");
  const next = book.indexOf("<h3>", head + SUBHEAD.length);
  const section = book.slice(head, next < 0 ? book.length : next);
  const bodies = section.match(/<tbody>[\s\S]*?<\/tbody>/g);
  if (bodies === null) throw new Error("§17.6 carries no table body");
  return bodies.join("\n");
}

const rowsOf = (body: string): string[] => body.match(ROW) ?? [];
const codesIn = (text: string): string[] => [...text.matchAll(CODE)].map((m) => m[1] as string);
const tokensOf = (body: string): string[] => [...new Set(codesIn(body))].sort();
/** The row's CANONICAL-NAME cell — the second `<td>`, where the name and its
 *  shape live. `sameRow` requirements resolve HERE, not over the whole row: a
 *  Rule-cell sentence that happens to mention `Irreversible` must not satisfy
 *  the Name cell's obligation to enumerate it, which is exactly the vacuity a
 *  reviewer measured on the one duplicated token in the table. */
const nameCellOf = (row: string): string => {
  const cells = row.match(/<td(?:\s[^>]*)?>[\s\S]*?<\/td>/g) ?? [];
  return cells[1] ?? "";
};

interface Fixed {
  /** The name as the table writes it, markup-escaped. */
  readonly name: string;
  /** Every OTHER spelling the same role is accepted under. */
  readonly also: readonly string[];
  /** Tokens the name cannot stand without, required IN ITS OWN ROW: the field
   *  list a language may return unnamed, or the values an enumeration is. Row-
   *  local on purpose — a global name set cannot tell a value that rides its
   *  own row from one that drifted into the row above. */
  readonly sameRow: readonly string[];
  /** Why this name is here — read by nobody, kept because a roster whose
   *  entries carry no reason is a roster nobody dares change. */
  readonly why: string;
}

const FIXED: readonly Fixed[] = [
  {
    name: "FoldOut&lt;S&gt;",
    also: [],
    sameRow: ["{ state, effects }"],
    why: "the fold's return. A language with structural tuples returns it unnamed, so the SHAPE is the part every port honors and the name may never stand alone.",
  },
  {
    name: "ArmOut&lt;S&gt;",
    also: [],
    sameRow: ["{ slice, effects, notices }"],
    why: "what one fold arm returns; the three arm rules of §6.5 are rules about its three fields, so the fields ride the row.",
  },
  {
    name: "BlockRegistration&lt;S&gt;",
    also: [],
    sameRow: ["{ block, verbs }"],
    why: "a block's one public contribution. The row it lands in is the block row, which already states the one-public-symbol rule in prose — the name attaches there rather than restating it.",
  },
  {
    name: "EffectHandler&lt;E&gt;",
    also: ["Handlers&lt;E&gt;", "EffectPerformer&lt;E&gt;"],
    sameRow: [],
    why: "one accepted spelling of the block-owned effect table: a function per effect kind.",
  },
  {
    name: "Handlers&lt;E&gt;",
    also: ["EffectHandler&lt;E&gt;", "EffectPerformer&lt;E&gt;"],
    sameRow: [],
    why: "the same table gathered over the union's own discriminant.",
  },
  {
    name: "EffectPerformer&lt;E&gt;",
    also: ["EffectHandler&lt;E&gt;", "Handlers&lt;E&gt;"],
    sameRow: [],
    why: "the other accepted spelling: one value per block that narrows then performs its whole sub-union. Collapsing it into either of the two above would be a rename.",
  },
  {
    name: "EffectClass",
    also: [],
    sameRow: ["Routine", "Irreversible"],
    why: "what an effect costs if it happens twice. Its two values ride the same row, and this entry is what makes that claim true rather than merely written.",
  },
];

/** Every way the table can state its fixed vocabulary wrongly. Pure, so the
 *  same function judges the live book and each planting built from it. */
export function nomenclatureProblems(book: string): string[] {
  const problems: string[] = [];
  const rows = rowsOf(tableBody(book));
  for (const fixed of FIXED) {
    const carrying = rows.filter((row) => codesIn(row).includes(fixed.name));
    if (carrying.length !== 1) {
      problems.push(
        `${fixed.name}: fixed in ${carrying.length} rows of §17.6, and a fixed name is stated exactly once`,
      );
      continue;
    }
    const tokens = codesIn(carrying[0] as string);
    for (const spelling of fixed.also) {
      if (!tokens.includes(spelling)) {
        problems.push(
          `${fixed.name}: its row does not also spell ${spelling}, so the row reads as one canonical name for a role that has more than one`,
        );
      }
    }
    const nameCellTokens = codesIn(nameCellOf(carrying[0] as string));
    for (const required of fixed.sameRow) {
      if (!nameCellTokens.includes(required)) {
        problems.push(
          `${fixed.name}: its row drops ${required}, which the name cannot stand without`,
        );
      }
    }
  }
  return problems;
}

const book = readFileSync(BOOK, "utf8");
const body = tableBody(book);
const tokenSet = tokensOf(body);
const nameTokens = tokenSet.filter((c) => TYPE_NAME.test(c));

/** THE VOCABULARY, PINNED EXACTLY — the roster-pin idiom. An equality, never a
 *  floor: a name quietly ADDED to the architecture's fixed set is as much a
 *  decision as one deleted, and both must be a one-line diff with a reason.
 *  Measured on the tree this landed on. */
const NAMES = [
  "Action",
  "Actor",
  "Agent",
  "ArmOut&lt;S&gt;",
  "Authority",
  "BlockRegistration&lt;S&gt;",
  "Command",
  "EffectClass",
  "EffectHandler&lt;E&gt;",
  "EffectPerformer&lt;E&gt;",
  "EventSource",
  "FoldOut&lt;S&gt;",
  "Handlers&lt;E&gt;",
  "Human",
  "Irreversible",
  "Notice",
  "Routine",
  "Signature",
  "Spine",
  "State",
  "StepRecord",
  "ToolResult",
  "ViewModel",
];

const ROWS = 27;
/** THE WHOLE DISTINCT TOKEN SET, LISTED — machine-derived from the landed
 *  table, never hand-typed. It was a scalar 48 and a scalar is PURCHASABLE: a
 *  one-for-one swap (drop `effectClass`, add `Foo&lt;T&gt;`) keeps the count,
 *  keeps the row count, keeps the name set under any enumerated type-parameter
 *  form, and silently deletes the spelling its own row's claim rests on. A list
 *  sees it. This is also the backstop under TYPE_NAME's remaining narrowness:
 *  the list is form-agnostic where a name regex cannot be. */
const TOKENS = [
  "(newState, effects)",
  "(tool, input)",
  "*Tool",
  "Action",
  "Actor",
  "Agent",
  "ArmOut&lt;S&gt;",
  "Authority",
  "BlockRegistration&lt;S&gt;",
  "Command",
  "EffectClass",
  "EffectHandler&lt;E&gt;",
  "EffectPerformer&lt;E&gt;",
  "EventSource",
  "FoldOut&lt;S&gt;",
  "Handlers&lt;E&gt;",
  "Human",
  "Irreversible",
  "Notice",
  "Routine",
  "Signature",
  "Spine",
  "State",
  "StepRecord",
  "ToolResult",
  "ViewModel",
  "agent",
  "core / domain",
  "ctx",
  "effectClass",
  "fold(state, results, now, sig) -&gt; (newState, effects)",
  "id",
  "inference",
  "now",
  "onAction(Action)",
  "project(state) -&gt; ViewModel",
  "projectContext(state, staged, bounds) -&gt; Context",
  "run(input, ctx) -&gt; ToolResult",
  "sensing",
  "sig",
  "state",
  "surface",
  "tool",
  "wireApp(env)",
  "{ block, verbs }",
  "{ schemaVersion, now, sig, staged, actions, results, commands, context }",
  "{ slice, effects, notices }",
  "{ state, effects }",
];

describe("§17.6 fixes the architecture's vocabulary, and states each name once", () => {
  it("finds the table at all — an empty derivation would pass everything", () => {
    expect(rowsOf(body).length).toBe(ROWS);
    expect(tokenSet).toEqual(TOKENS);
  });

  it("pins the fixed name set EXACTLY, so an addition and a deletion both show", () => {
    expect(nameTokens).toEqual(NAMES);
  });

  it("every name the architecture fixes is stated, in exactly one row, with its shape", () => {
    expect(nomenclatureProblems(book)).toEqual([]);
  });

  it("EVERY pinned name rides its exact row count — not only FIXED's seven", () => {
    // A reviewer restated `Notice` in a second row and the gate stayed green,
    // because the one-row guarantee was bound to the 7-entry FIXED roster while
    // the vocabulary pin holds 23. The binding is the whole NAMES list now,
    // with the three legitimate multi-row names pinned at their measured count:
    // Actor, State and ToolResult each hold a canonical row AND ride another
    // row's payload shape. An equality per name, never a floor.
    const SHARED_ROWS: Readonly<Record<string, number>> = {
      Actor: 2,
      State: 2,
      ToolResult: 2,
    };
    const rows = rowsOf(body);
    const counts = Object.fromEntries(
      NAMES.map((n) => [n, rows.filter((r) => codesIn(r).includes(n)).length]),
    );
    expect(counts).toEqual(Object.fromEntries(NAMES.map((n) => [n, SHARED_ROWS[n] ?? 1])));
  });

  it("DENIES a pinned name restated in a second row — reviewer's own mutation", () => {
    const planted = book.replace(
      "<code>{ schemaVersion, now, sig, staged, actions, results, commands, context }</code>",
      "<code>{ schemaVersion, now, sig, staged, actions, results, commands, context }</code>, carrying each arm’s <code>Notice</code>",
    );
    expect(planted).not.toBe(book);
    const rows = rowsOf(tableBody(planted));
    expect(rows.filter((r) => codesIn(r).includes("Notice")).length).toBe(2);
  });

  it("DENIES a SECOND table planted inside §17.6 — the scope is the subsection", () => {
    // Reviewer's CX-A: a whole second table in the book's own live markup,
    // restating `ArmOut<S>`, invisible to a first-tbody-only locator. The
    // derivation reads every tbody to the next subsection head, so the
    // planting now moves the row census AND doubles the fixed name.
    const marker = "  <p>The lineage is explicit.";
    expect(book).toContain(marker);
    const planted = book.replace(
      marker,
      '<div class="tbl"><table><tbody><tr><td>what one fold arm returns</td><td><code>ArmOut&lt;S&gt;</code></td><td class="r">one arm, one slice</td></tr></tbody></table></div>\n' +
        marker,
    );
    expect(rowsOf(tableBody(planted)).length).not.toBe(ROWS);
    expect(nomenclatureProblems(planted).join("\n")).toContain("fixed in 2 rows");
  });

  it("DENIES the enumeration dropped from the NAME cell while the Rule cell still says it", () => {
    // Reviewer's CE_IRREV: `Irreversible` occurs twice in the EffectClass row —
    // the Name cell's enumeration and, independently, the Rule cell's sentence.
    // Row-local resolution let the Rule cell satisfy the Name cell's duty.
    const row = rowsOf(body).find((r) => codesIn(r).includes("EffectClass"));
    expect(row).toBeDefined();
    const cell = nameCellOf(String(row));
    const gutted = String(row).replace(
      cell,
      cell.replace(/\s*\|\s*<code(?:\s[^>]*)?>Irreversible<\/code>/, ""),
    );
    expect(gutted).not.toBe(String(row));
    const planted = book.replace(String(row), gutted);
    expect(nomenclatureProblems(planted).join("\n")).toContain(
      "EffectClass: its row drops Irreversible",
    );
  });

  it("the roster it judges is not empty, and every entry names a live row", () => {
    // The other vacuity mouth: `nomenclatureProblems` reports nothing over an
    // empty FIXED, so the roster's own size and membership are asserted here.
    expect(FIXED.length).toBe(7);
    for (const fixed of FIXED) {
      expect(NAMES, fixed.name).toContain(fixed.name);
      expect(fixed.why.length, fixed.name).toBeGreaterThan(20);
    }
  });

  it("DENIES a deleted name — the presence half is not vacuous", () => {
    const planted = book.replace(
      "<code>ArmOut&lt;S&gt;</code>",
      "the arm's own return shape, whatever you call it",
    );
    expect(planted).not.toBe(book);
    expect(nomenclatureProblems(planted).join("\n")).toContain("fixed in 0 rows");
  });

  it("DENIES the same name fixed twice — the one-statement half is not vacuous", () => {
    const row = rowsOf(body).find((r) => codesIn(r).includes("ArmOut&lt;S&gt;"));
    expect(row).toBeDefined();
    const planted = book.replace(String(row), `${String(row)}\n      ${String(row)}`);
    expect(planted).not.toBe(book);
    expect(nomenclatureProblems(planted).join("\n")).toContain("fixed in 2 rows");
  });

  it("DENIES a collapsed divergence — the two-spellings half is not vacuous", () => {
    // The failure this exists for: the effect table's two accepted spellings
    // split into rows of their own, each reading as the one canonical word.
    // The clause is located FORM-KEYED off the row that carries the third
    // spelling, so neither a reskin of the tag nor a reword of the sentence
    // around it can degrade this denial into fixture maintenance. The
    // assert-first guard stays: an inert planting fails LOUD.
    const row = rowsOf(body).find((r) => codesIn(r).includes("EffectPerformer&lt;E&gt;"));
    expect(row).toBeDefined();
    const clause = /,\s*or one <code(?:\s[^>]*)?>EffectPerformer&lt;E&gt;<\/code>[^<]*/;
    expect(clause.test(String(row))).toBe(true);
    const split = String(row).replace(clause, "");
    expect(split).not.toBe(String(row));
    const planted = book.replace(
      String(row),
      `${split}\n      <tr><td>who performs a block's own effects</td><td><code>EffectPerformer&lt;E&gt;</code></td><td class="r">registered beside the verbs (G11)</td></tr>`,
    );
    const said = nomenclatureProblems(planted).join("\n");
    expect(said).toContain("EffectPerformer&lt;E&gt;: its row does not also spell");
    expect(said).toContain("EffectHandler&lt;E&gt;: its row does not also spell");
  });

  it("DENIES a dropped shape — the honor-the-shape half is not vacuous", () => {
    const planted = book.replace("<code>{ state, effects }</code>", "a pair");
    expect(planted).not.toBe(book);
    expect(nomenclatureProblems(planted).join("\n")).toContain("FoldOut&lt;S&gt;: its row drops");
  });

  it("DENIES an effect value moved off its own row — sameRow is ROW-local", () => {
    // Equivalent to moving `Routine`/`Irreversible` up into the effect-descriptor
    // row above: ROWS stays 27, the token set stays whole and the name set stays
    // whole, so every global census reads clean while `EffectClass` is left
    // naming nothing. Only a row-local requirement sees it.
    const planted = book.replace("<code>Routine</code> | ", "");
    expect(planted).not.toBe(book);
    expect(nomenclatureProblems(planted).join("\n")).toContain(
      "EffectClass: its row drops Routine",
    );
  });

  it("SEES a name added in the book's own CLASSED idiom — the census is form-keyed", () => {
    // The false negative an enumerated `<code>` open tag ships with: the book
    // writes `<code class="i">` more often than the bare form, so a name added
    // in its dominant idiom would move neither census and this file's own title
    // claim — an addition and a deletion both show — would be false.
    const planted = book.replace(
      '<td class="r">never imports a sibling (G11)</td>',
      '<td class="r">never imports a sibling; its registration rides one <code class="i">BlockEnvelope&lt;S&gt;</code> (G11)</td>',
    );
    expect(planted).not.toBe(book);
    expect(tokensOf(tableBody(planted))).not.toEqual(tokenSet);
    expect(tokensOf(tableBody(planted)).filter((c) => TYPE_NAME.test(c))).not.toEqual(nameTokens);
  });

  it("SEES a one-for-one token SWAP — a count would not, a list does", () => {
    const planted = book.replace(
      "declared on every effect descriptor as <code>effectClass</code>",
      "declared on every effect descriptor, and narrowed by <code>Foo&lt;T&gt;</code>",
    );
    expect(planted).not.toBe(book);
    const swapped = tokensOf(tableBody(planted));
    // The length is IDENTICAL — which is exactly why the pin above is a list.
    expect(swapped.length).toBe(tokenSet.length);
    expect(swapped).not.toEqual(tokenSet);
  });

  it("does NOT report a purely cosmetic reskin of an existing token", () => {
    // The false positive the same enumerated tag ships with, and it is the
    // worse half: re-dressing one live token would have reported
    // `EffectPerformer<E>: fixed in 0 rows` over a row that spells it.
    const planted = book.replace(
      "one <code>EffectPerformer&lt;E&gt;</code> that narrows",
      'one <code class="k">EffectPerformer&lt;E&gt;</code> that narrows',
    );
    expect(planted).not.toBe(book);
    expect(nomenclatureProblems(planted)).toEqual([]);
    expect(tokensOf(tableBody(planted))).toEqual(tokenSet);
  });

  it("REFUSES to run over a book with no §17.6 — it does not shrug and pass", () => {
    expect(() => nomenclatureProblems(book.replace(SUBHEAD, "<h3>"))).toThrow(
      "no §17.6 subsection head",
    );
  });
});
