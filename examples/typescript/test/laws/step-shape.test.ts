// ── THE BOOK STATES THE STEP'S SHAPE, AND A SECTION-LOCAL EDIT MISSES IT ───
//
// The Actor moved out of `FinishedStep` and onto the submission channel, and
// the section that teaches the seam was rewritten to say so. Three other places
// in the same two files went on declaring the old payload — one of them
// twenty-seven lines above the corrected text, inside the SAME `<pre>` listing.
// That is the failure mode `record-shape.test.ts` next door already writes down
// for `StepRecord`: reconcile the section, leave the DOCUMENT saying one thing
// two ways, and the gate stays green over the contradiction.
//
// So the rule is not "these three lines are correct". It is a DERIVATION over
// the whole wiki tree: find every place a `FinishedStep` is written out with a
// field list, and require none of them to name an actor. The field names are
// read out of `src/spine/boundary/action.ts` rather than retyped here, so a
// future rename moves the rule with the port instead of quietly past it, and a
// pseudocode block authored next year is covered the day it is written.
//
// FIVE ASSERTIONS, THREE COORDINATES. A field list is one way to state the
// shape; `step.by` in prose is a second; the seam page's own `What crosses`
// slot is a third, and that one is located STRUCTURALLY, by the book's eight-
// slot template, because a phrase-window heuristic over the surrounding prose
// was measured producing three false positives on a correctly reconciled tree.
//
// WHY IT LIVES HERE. test/laws is the ONE citation-exempt path
// (`SKIPPED_PATHS` in citations.test.ts), so this file adds no citation credit
// and cannot move the `examples/typescript` RESOLVABLE_PIN. It is a document
// check, not a code check, which is also why it is not a gate CHECK: the gate's
// seventeen checks read Kotlin and TypeScript trees, not HTML.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { must } from "../support/must";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");
const WIKI = join(REPO, "wiki");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out.sort();
}

/** READ THE BOOK ONCE, LAZILY. Five assertions over the whole wiki tree is five
 *  full sweeps if each recomputes, and this suite runs its files in parallel
 *  next to three tests that shell out to `tsc` under a 5s budget — measured, the
 *  unmemoised version tipped those over on two runs in six. Lazy rather than
 *  module-scope so a broken anchor still throws inside the test that names it. */
const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}
const htmlFiles = (): readonly string[] => once("files", () => walk(WIKI));
const bodies = (): ReadonlyMap<string, string> =>
  once("bodies", () => new Map(htmlFiles().map((f) => [f, readFileSync(f, "utf8")])));

/** Tags and entities out, whitespace flattened: a field list split across five
 *  `<pre>` lines and one written inline in a table cell must read the same to
 *  this rule, or the rule pins a formatting style instead of a claim. */
function flatten(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

/** The step's OWN member names, DERIVED from the port rather than retyped.
 *
 *  ANCHORED ON THE PROPERTY POSITION, and that is not a style choice: the naive
 *  `/readonly (\w+)/g` also captures the INNER `readonly StagedInput[]` and
 *  `readonly Action[]` element types, which inflates the required field set and
 *  silently drops two of the three sites below the density floor. Measured. */
function declaredFieldsRaw(): readonly string[] {
  const src = readFileSync(join(REPO, "examples/typescript/src/spine/boundary/action.ts"), "utf8");
  const body = /export interface FinishedStep \{([^}]*)\}/.exec(src);
  if (!body) throw new Error("FinishedStep declaration not found — the derivation lost its anchor");
  return [...must(body[1]).matchAll(/^\s*readonly (\w+)\s*[?:]/gm)].map((m) => must(m[1]));
}
const declaredFields = (): readonly string[] => once("fields", declaredFieldsRaw);

/** Every token that names an actor, in any of the three values or the type. */
const ACTOR = /\b(Actor|Human|Agent|Spine)\b/;
/** Balanced-scan cap: a span still open after this many characters FAILS CLOSED. */
const SPAN_CAP = 4000;

interface Site {
  readonly file: string;
  readonly at: string;
  readonly names: boolean;
}

/** A SITE is `FinishedStep` followed, within 40 characters, by the `{` or `(`
 *  that opens a field list — bounded by its BALANCED closing delimiter, never
 *  by a fixed window. What separates a written-out payload from a bare mention
 *  (`submit(FinishedStep) -> StepIndex`, a prose sentence) is FIELD DENSITY
 *  inside the delimited span: a real list names the step's own members. */
function fieldListSitesRaw(): readonly Site[] {
  const fields = declaredFields();
  const found: Site[] = [];
  for (const file of htmlFiles()) {
    const rel = file.slice(REPO.length + 1);
    const flat = flatten(must(bodies().get(file)));
    for (const match of flat.matchAll(/FinishedStep.{0,40}?[{(]/g)) {
      const openAt = match.index + must(match[0]).length - 1;
      const open = flat[openAt];
      const close = open === "{" ? "}" : ")";
      let depth = 0;
      let end = -1;
      for (let i = openAt; i < Math.min(flat.length, openAt + SPAN_CAP); i += 1) {
        if (flat[i] === open) depth += 1;
        else if (flat[i] === close) {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) {
        // FAIL-CLOSED, never skip: a span the rule cannot bound is a finding,
        // not a non-site — it lands NAMING an actor so it goes red in the open.
        found.push({
          file: rel,
          at: `${rel} :: ${flat.slice(match.index, match.index + 90)} [UNCLASSIFIABLE]`,
          names: true,
        });
        continue;
      }
      const span = flat.slice(openAt + 1, end);
      if (fields.some((f) => !new RegExp(`\\b${f}\\b`).test(span))) continue; // a bare mention
      found.push({
        file: rel,
        at: `${rel} :: ${flat.slice(match.index, match.index + 90)}`,
        names: ACTOR.test(span),
      });
    }
  }
  return found;
}
const fieldListSites = (): readonly Site[] => once("sites", fieldListSitesRaw);

/** The book's own eight-slot template: the `What crosses` slot's `In:` clause.
 *  Structural, not a phrase guess — it is the seam page's normative statement
 *  of what the boundary is handed, and it is the one place in the book that
 *  says it in prose rather than as a field list. */
function crossesInClausesRaw(): readonly string[] {
  const out: string[] = [];
  for (const file of htmlFiles()) {
    const html = must(bodies().get(file));
    for (const slot of html.matchAll(/<div class="slot crosses">([\s\S]*?)<\/div><\/div>/g)) {
      const clause = /<strong>In:<\/strong>([\s\S]*?)(<strong>|$)/.exec(must(slot[1]));
      if (clause && /FinishedStep/.test(must(clause[1]))) {
        out.push(`${file.slice(REPO.length + 1)} :: ${flatten(must(clause[1])).trim()}`);
      }
    }
  }
  return out;
}
const crossesInClauses = (): readonly string[] => once("crosses", crossesInClausesRaw);

describe("the book spells FinishedStep the way the ports declare it (5.3)", () => {
  it("derives the step's members from the port, not from this file", () => {
    // The derivation's own vacuity guard. An anchor that stopped matching would
    // throw; an anchor that matched but yielded NOTHING would make every span
    // below trivially "contain all the fields", turning the census into noise.
    expect(declaredFields()).toEqual(["staged", "actions"]);
  });

  it("finds the written-out field lists at all — an empty sweep would pass everything", () => {
    // Three sites across two files, measured on the tree this landed on. Rename
    // the type or reformat every block and this goes red rather than silently
    // reporting a clean sweep over nothing.
    const all = fieldListSites();
    expect(all.map((s) => s.at).length).toBe(3);
    expect([...new Set(all.map((s) => s.file))].sort()).toEqual([
      "wiki/example/02-the-boundary.html",
      "wiki/example/index.html",
    ]);
  });

  it("no written-out FinishedStep names an actor — of ANY of the three values", () => {
    // The ban is on the SHAPE, not on the string `by:`. Renaming the field to
    // `onBehalfOf` in a pseudocode block is the same claim and is equally red.
    expect(
      fieldListSites()
        .filter((s) => s.names)
        .map((s) => s.at),
    ).toEqual([]);
  });

  it("no document reads the actor off the step", () => {
    // The other coordinate: not a field list, a dereference in prose. `step.by`
    // survived the section rewrite in §13's read-it-top-to-bottom paragraph.
    for (const file of htmlFiles()) {
      expect(must(bodies().get(file)), file).not.toMatch(/\bstep\.by\b/);
    }
  });

  it("the seam page's `What crosses / In:` clause gives the step no actor", () => {
    const clauses = crossesInClauses();
    expect(clauses.length).toBe(1); // vacuity guard: located by template, not phrase
    expect(clauses.filter((c) => ACTOR.test(c))).toEqual([]);
  });
});
