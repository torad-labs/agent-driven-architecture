#!/usr/bin/env bun
/**
 * THE LATTICE GATE — makes the manifest set behave as a todo list.
 *
 * "The manifest lattice IS the todo list: a referenced-but-missing unit is mechanically visible,
 * never remembered" (concept #959). That property is not free — it is this file. Without a gate
 * cross-checking the planes, manifests are just prose that happens to be TOML.
 *
 * Three checks, each catching a different way the planes drift apart:
 *   1. every unit names a matrix row, and that row EXISTS      (future declared, present missing)
 *   2. every matrix row is named by some unit                  (present built, future never said)
 *   3. `composes` references resolve, and only ONE LEVEL DOWN   (the one-step law)
 *
 * Check 3 is the one that keeps the graph shallow. A unit reaching two levels down is not a
 * shortcut; it is a missing unit at the level in between.
 */

import { readLines } from "../campaigns/ledger-core.ts";

/**
 * The level ladder, low to high. Named for their COMPOSITIONAL role rather than their subject
 * matter, because the one-step law is about how far a reference may reach and subject-named
 * levels ("voice", "canvas") invite parallel concerns to be filed as if they were a stack.
 *
 *   foundation  leaves — raw capabilities and standing documents; compose nothing
 *   adapter     wraps exactly one foundation concern into something usable
 *   composite   binds adapters together into a working behaviour
 *   surface     what a human touches
 */
const LEVELS: readonly string[] = ["foundation", "adapter", "composite", "surface"];

type Unit = {
  readonly id: string;
  readonly level: string;
  readonly row: string;
  readonly composes: readonly string[];
  readonly manifest: string;
};

function parseUnits(text: string, manifest: string): Unit[] {
  const parsed = Bun.TOML.parse(text) as { units?: readonly Record<string, unknown>[] };
  return (parsed.units ?? []).map((unit) => ({
    id: String(unit["id"] ?? ""),
    level: String(unit["level"] ?? ""),
    row: String(unit["row"] ?? ""),
    composes: Array.isArray(unit["composes"]) ? (unit["composes"] as string[]) : [],
    manifest,
  }));
}

const root = Bun.argv[2] ?? ".";
const failures: string[] = [];

const manifestPaths = await Array.fromAsync(
  new Bun.Glob("*.toml").scan({ cwd: `${root}/dev/manifests` }),
).catch(() => [] as string[]);

const units: Unit[] = [];
for (const name of manifestPaths) {
  const text = await Bun.file(`${root}/dev/manifests/${name}`).text();
  units.push(...parseUnits(text, name));
}

const matrixText = (await readLines(`${root}/dev/matrix.toml`)).join("\n");
const matrixRows = new Set(
  ((Bun.TOML.parse(matrixText) as { rows?: readonly Record<string, unknown>[] }).rows ?? []).map(
    (row) => String(row["id"] ?? ""),
  ),
);

const unitIds = new Set(units.map((unit) => unit.id));

/**
 * A unit with an EMPTY `row` used to escape both checks entirely.
 *
 * Check 1 skipped it (`unit.row !== ""`), and check 2 only iterates matrix rows, so a unit with a
 * forgotten row was declared-future with no present row and invisible to the lattice — green gate,
 * unearnable unit. Every unit happens to carry a row today, so it was latent; but catching the day
 * someone forgets is the gate's entire purpose.
 *
 * `row = "none"` is the explicit sentinel. It exists so that DELIBERATELY unrowed — a unit that is
 * a standing document or a premise rather than a buildable artifact — is distinguishable from
 * FORGOTTEN. An empty string cannot carry that distinction, which is why it is now an error rather
 * than a silent skip.
 */
const UNROWED_SENTINEL = "none";

for (const unit of units) {
  if (unit.row === "") {
    failures.push(
      `${unit.manifest}: unit ${unit.id} has an empty \`row\`.\n` +
        `    Every unit must name its matrix row, or say \`row = "${UNROWED_SENTINEL}"\` to declare\n` +
        `    that it deliberately has none. An empty string cannot tell those apart, and a unit\n` +
        `    that names no row is invisible to this gate — declared in the future with no present.`,
    );
    continue;
  }
  if (unit.row === UNROWED_SENTINEL) continue;
  if (!matrixRows.has(unit.row)) {
    failures.push(`${unit.manifest}: unit ${unit.id} names row "${unit.row}", which is not in dev/matrix.toml`);
  }
}

// 2 — a matrix row nothing declares. Something is being built that was never designed.
const claimed = new Set(units.map((unit) => unit.row));
for (const row of matrixRows) {
  if (!claimed.has(row)) {
    failures.push(`dev/matrix.toml: row ${row} is not declared by any manifest unit`);
  }
}

// 3 — the one-step law.
for (const unit of units) {
  const levelIndex = LEVELS.indexOf(unit.level);
  if (levelIndex === -1) {
    failures.push(`${unit.manifest}: unit ${unit.id} has level "${unit.level}", not one of ${LEVELS.join("|")}`);
    continue;
  }
  for (const reference of unit.composes) {
    if (!unitIds.has(reference)) {
      failures.push(`${unit.manifest}: unit ${unit.id} composes "${reference}", which does not exist`);
      continue;
    }
    const target = units.find((candidate) => candidate.id === reference);
    const targetIndex = LEVELS.indexOf(target?.level ?? "");
    if (targetIndex !== levelIndex - 1) {
      failures.push(
        `${unit.manifest}: ${unit.id} (${unit.level}) composes ${reference} (${target?.level}) — ` +
          `the one-step law allows only the level directly below. If you need it, the missing ` +
          `piece is a unit at the level in between, not a longer reach.`,
      );
    }
  }
}

if (failures.length === 0) {
  console.log(`lattice: clean · ${units.length} units, ${matrixRows.size} rows`);
  process.exit(0);
}

console.error(`lattice: ${failures.length} problem(s)\n`);
for (const failure of failures) console.error(`  ${failure}`);
process.exit(1);
