// ── REGENERATE the book's "held today by" column from laws.toml ───────────
//
//   npm run laws:regenerate
//
// The book is ONE hand-authored HTML file and stays that way: nothing in the
// build rewrites it. This is an OFFLINE helper for the one CELL the registry
// fully owns — the fourth column of §15.3's invariant table, "held today by",
// which is exactly `<strong>headline</strong> note` out of laws.toml. Run it
// after editing the registry, read the diff, commit it.
//
// The other three cells are NOT regenerated: the id, the invariant name and the
// guarantee prose live in the book, not in the registry. The meta-check asserts
// the ids, the order and the names instead — off the SAME four-cell row, so the
// column cannot be lifted back out into a table of its own unnoticed.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseLaws } from "./registry";

const REPO = join(dirname(new URL(import.meta.url).pathname), "..", "..", "..", "..");
const BOOK = join(REPO, "wiki", "index.html");

const { registry, problems } = parseLaws(readFileSync(join(REPO, "laws.toml"), "utf8"));
if (problems.length > 0) {
  process.stdout.write(`laws.toml does not parse:\n  ${problems.join("\n  ")}\n`);
  process.exit(1);
}

let book = readFileSync(BOOK, "utf8");
let matched = 0;
let rewritten = 0;
for (const law of registry.laws) {
  const row = new RegExp(
    `(<tr><td class="r">${law.id}</td><td>[a-z-]+</td><td>.*?</td><td>)<strong>.*?(</td></tr>)`,
  );
  if (!row.test(book)) {
    process.stdout.write(`no four-cell invariant row for ${law.id}\n`);
    continue;
  }
  matched += 1;
  const next = book.replace(row, `$1<strong>${law.headline}</strong> ${law.note}$2`);
  if (next !== book) rewritten += 1;
  book = next;
}
writeFileSync(BOOK, book);
process.stdout.write(
  `matched ${matched}/${registry.laws.length} enforcement cells, rewrote ${rewritten}\n`,
);
