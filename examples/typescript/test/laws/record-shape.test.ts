// ── THE BOOK STATES THE RECORD'S SHAPE, AND IT STATES IT IN TEN PLACES ────
//
// D21 gave `StepRecord` its 14.7 envelope in both ports. The documents spell
// that record's field list at ten sites across three HTML files — pseudocode
// blocks, a normative type declaration, a canonical-names table row, and the
// worked example's own transcript. A section-local edit reconciles the section
// and leaves the DOCUMENT saying one thing two ways, which is exactly how §14.1
// came to mandate `{ schemaVersion, … }` while §14.6's sketch six lines earlier
// showed a record without one.
//
// So the rule is not "these ten lines are correct". It is a DERIVATION over
// the whole wiki tree: find every place a `StepRecord` is written out with a
// field list, and require the envelope to be the first thing in it. A new
// pseudocode block written next year is covered the day it is authored — which
// is the difference between pinning the instances and closing the class.
//
// WHY IT LIVES HERE. test/laws is the ONE citation-exempt path
// (`SKIPPED_PATHS` in citations.test.ts), so this file adds no citation credit
// and cannot move the `examples/typescript` RESOLVABLE_PIN. It is a document
// check, not a code check, which is also why it is not a gate CHECK: the gate's
// fifteen checks read Kotlin and TypeScript trees, not HTML.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");
const WIKI = join(REPO, "wiki");

function htmlFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out.sort();
}

/** Tags and entities out, whitespace flattened: a field list split across five
 *  `<pre>` lines and one written inline in a table cell must read the same to
 *  this rule, or the rule pins a formatting style instead of a claim. */
function flatten(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

/** A SITE is `StepRecord` followed, within 40 characters, by the `{` or `(`
 *  that opens a field list — bounded by its BALANCED closing delimiter, never
 *  by a fixed window. Review appended a long-form field list whose `now` sat
 *  307 characters in and a 200-char window dropped it silently, invisible to
 *  the assertion and the vacuity count at once. What distinguishes a
 *  written-out record from a bare mention (`append(StepRecord) -> StepIndex`,
 *  a prose sentence) is FIELD DENSITY inside the delimited span, not distance:
 *  a real field list names several of the record's own fields. */
const SITE = /StepRecord.{0,40}?[{(]/g;
/** How many of the record's field names a delimited span must carry to be a
 *  written-out field list. Bare mentions measure 0-1; every real list in the
 *  book measures 5+. */
const FIELD_FLOOR = 3;
const FIELDS = [/\bsig\b/, /\bstaged\b/, /\bactions\b/, /\bresults\b/, /\bnow\b/, /\bcommands\b/, /\bcontext\b/];
/** Balanced-scan cap: a span still open after this many characters is an
 *  UNCLASSIFIABLE site and fails closed. */
const SPAN_CAP = 4000;

interface Site {
  readonly file: string;
  readonly text: string;
  readonly stamped: boolean;
}

function sites(): readonly Site[] {
  const found: Site[] = [];
  for (const file of htmlFiles(WIKI)) {
    const flat = flatten(readFileSync(file, "utf8"));
    for (const match of flat.matchAll(SITE)) {
      const openAt = match.index + match[0].length - 1;
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
        // not a non-site — it lands unstamped so it goes red and the rule (or
        // the site) gets fixed in the open.
        found.push({
          file: file.slice(REPO.length + 1),
          text: `${flat.slice(match.index, match.index + 90)} [UNCLASSIFIABLE: unbalanced span]`,
          stamped: false,
        });
        continue;
      }
      const span = flat.slice(openAt + 1, end);
      if (FIELDS.filter((f) => f.test(span)).length < FIELD_FLOOR) continue; // a bare mention
      const version = span.search(/\bschemaVersion\b/);
      const now = span.search(/\bnow\b/);
      found.push({
        file: file.slice(REPO.length + 1),
        text: flat.slice(match.index, match.index + 90),
        stamped: version >= 0 && (now < 0 || version < now),
      });
    }
  }
  return found;
}

describe("the book spells the committed record the way the ports write it (14.7)", () => {
  it("finds the record's field lists at all — an empty derivation would pass everything", () => {
    // The vacuity guard. If a future rewrite renames the type or reformats every
    // block, this goes red rather than silently reporting a clean sweep over
    // nothing. Ten sites across three files, measured on the tree this landed on.
    const all = sites();
    expect(all.length).toBe(10);
    expect([...new Set(all.map((s) => s.file))].sort()).toEqual([
      "wiki/example/02-the-boundary.html",
      "wiki/example/index.html",
      "wiki/index.html",
    ]);
  });

  it("EVERY written-out StepRecord leads with schemaVersion", () => {
    expect(sites().filter((s) => !s.stamped)).toEqual([]);
  });

  it("no document still counts the record's fields in prose", () => {
    // The other way a count rots: not a field list but a number in a sentence.
    // `Seven fields` was true of the worked example until D21 made it eight, and
    // a phrase is invisible to the field-list rule above.
    for (const file of htmlFiles(WIKI)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/(Seven|seven|Eight|eight) fields/);
    }
  });
});
