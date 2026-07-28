// ── REGENERATE the book's enforcement map from laws.toml ──────────────────
//
//   npm run laws:regenerate
//
// The book is ONE hand-authored HTML file and stays that way: nothing in the
// build rewrites it. This is an OFFLINE helper for the one table the registry
// fully owns — §15.3's "where each law is actually enforced" map, whose every
// cell is exactly `<strong>headline</strong> note` out of laws.toml. Run it
// after editing the registry, read the diff, commit it.
//
// The invariant table above it is NOT regenerated: its third column is the
// guarantee prose, which lives in the book and not in the registry. The
// meta-check asserts that table's ids, order and names instead.

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
  const row = new RegExp(`(<tr><td class="r">${law.id}</td><td>)<strong>.*?(</td></tr>)`);
  if (!row.test(book)) {
    process.stdout.write(`no enforcement-map row for ${law.id}\n`);
    continue;
  }
  matched += 1;
  const next = book.replace(row, `$1<strong>${law.headline}</strong> ${law.note}$2`);
  if (next !== book) rewritten += 1;
  book = next;
}
writeFileSync(BOOK, book);
process.stdout.write(
  `matched ${matched}/${registry.laws.length} enforcement-map cells, rewrote ${rewritten}\n`,
);
