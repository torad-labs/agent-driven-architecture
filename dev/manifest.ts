#!/usr/bin/env bun
/**
 * MANIFEST CLI — the composition plane's only channel.
 *
 * The vendored harness guards three CLI-only planes (`.claude/hooks/modules/02-ledger-channel.ts`
 * blocks raw edits to campaigns, matrix AND manifests) but shipped CLIs for two of them:
 * `ledger.ts` speaks `[[items]]`, `matrix.ts` speaks `[[rows]]`, and nothing spoke `[[units]]` —
 * the manifest's "only channel" did not exist. Found 2026-07-27, when the adversarial review
 * needed a one-line `composes` fix and the wall correctly refused the raw edit.
 *
 * Same doctrine as ledger-core, which this reuses: writes are line-surgical, never a serializer
 * round-trip (comments are the memory); every write locks, re-parses and rolls back; `get` costs
 * a block, not a whole-file read. Cross-plane truth (units ↔ rows, the one-step law) stays in
 * `dev/gates/lattice.ts` — `validate` here checks only what a single file can know, plus one
 * thing lattice's set-based checks cannot see: two units claiming the same row.
 *
 * Worth promoting upstream to eli-operator, like the repo.ts extraction before it.
 */

import { LedgerError, mutate, parseOrThrow, readLines, today, toml } from "./campaigns/ledger-core.ts";

/** Mirror of dev/gates/lattice.ts LEVELS — keep in lockstep. (lattice.ts is a script with
 *  top-level effects, so importing it here would run the gate; one duplicated array with this
 *  comment beats that.) */
const LEVELS: readonly string[] = ["foundation", "adapter", "composite", "surface"];

type UnitBlock = {
  readonly id: string;
  readonly level: string;
  readonly row: string;
  readonly composes: readonly string[];
  /** Index of the `[[units]]` line. */
  readonly start: number;
  /** One past the block's last content line (trailing blanks excluded, comments included). */
  readonly end: number;
};

const UNIT_HEADER = /^\[\[units\]\]\s*$/;
const TABLE_HEADER = /^\s*\[/;

function scalar(line: string, key: string): string | null {
  const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*$`));
  return match?.[1] === undefined ? null : match[1].replace(/\\"/g, '"');
}

function inlineArray(line: string, key: string): readonly string[] | null {
  const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[(.*)\\]\\s*$`));
  if (match?.[1] === undefined) return null;
  const inner = match[1].trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((piece) => piece.trim().replace(/^"|"$/g, ""))
    .filter((piece) => piece !== "");
}

/** Locate every unit block by scanning lines — parser for values, line spans for writes,
 *  exactly the locateItems pattern in ledger-core. */
function locateUnits(lines: readonly string[]): UnitBlock[] {
  const blocks: UnitBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!UNIT_HEADER.test(lines[index] ?? "")) continue;

    let end = index + 1;
    while (end < lines.length && !TABLE_HEADER.test(lines[end] ?? "")) end += 1;

    let lastContent = end;
    while (lastContent > index + 1 && (lines[lastContent - 1] ?? "").trim() === "") {
      lastContent -= 1;
    }

    const body = lines.slice(index, lastContent);
    blocks.push({
      start: index,
      end: lastContent,
      id: body.map((line) => scalar(line, "id")).find((v) => v !== null) ?? "",
      level: body.map((line) => scalar(line, "level")).find((v) => v !== null) ?? "",
      row: body.map((line) => scalar(line, "row")).find((v) => v !== null) ?? "",
      composes: body.map((line) => inlineArray(line, "composes")).find((v) => v !== null) ?? [],
    });

    index = end - 1;
  }

  return blocks;
}

function findUnit(blocks: readonly UnitBlock[], id: string): UnitBlock {
  const found = blocks.find((block) => block.id === id);
  if (found === undefined) throw new LedgerError(`no unit with id "${id}"`);
  return found;
}

function tomlList(values: readonly string[]): string {
  return `[${values.map((value) => toml(value)).join(", ")}]`;
}

// ── commands ──────────────────────────────────────────────────────────────────────────────────

async function list(path: string): Promise<string> {
  const blocks = locateUnits(await readLines(path));
  const rows = blocks.map(
    (block) =>
      `${block.id.padEnd(24)} ${block.level.padEnd(11)} ${block.row.padEnd(22)} ` +
      (block.composes.length === 0 ? "—" : block.composes.join(", ")),
  );
  return [`${"id".padEnd(24)} ${"level".padEnd(11)} ${"row".padEnd(22)} composes`, ...rows].join("\n");
}

async function get(path: string, id: string): Promise<string> {
  const lines = await readLines(path);
  const block = findUnit(locateUnits(lines), id);
  return lines.slice(block.start, block.end).join("\n");
}

export type AddArgs = {
  readonly id: string;
  readonly level: string;
  readonly row: string;
  readonly composes: readonly string[];
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly sources: readonly string[];
  readonly note: string | null;
};

async function add(path: string, args: AddArgs): Promise<void> {
  if (args.id === "") throw new LedgerError("add: --id is required");
  if (!LEVELS.includes(args.level)) {
    throw new LedgerError(`add: --level must be one of ${LEVELS.join("|")}, got "${args.level}"`);
  }
  if (args.row === "") throw new LedgerError("add: --row is required (declare-then-earn needs a matrix row)");

  await mutate(path, (lines) => {
    const blocks = locateUnits(lines);
    if (blocks.some((block) => block.id === args.id)) {
      throw new LedgerError(`add: unit "${args.id}" already exists`);
    }

    const block: string[] = [
      "[[units]]",
      `id = ${toml(args.id)}`,
      `level = ${toml(args.level)}`,
      `row = ${toml(args.row)}`,
      `composes = ${tomlList(args.composes)}`,
      `inputs = ${tomlList(args.inputs)}`,
      `outputs = ${tomlList(args.outputs)}`,
      `sources = ${tomlList(args.sources)}`,
    ];
    if (args.note !== null) block.push(`note = ${toml(args.note)}`);

    // Insert after the last unit of the same level, so the file's level banners keep meaning;
    // a level with no units yet appends at end of file.
    const sameLevel = blocks.filter((candidate) => candidate.level === args.level);
    const last = sameLevel[sameLevel.length - 1];
    const at = last === undefined ? lines.length : last.end;

    return [...lines.slice(0, at), "", ...block, ...lines.slice(at)];
  });
}

async function setComposes(path: string, id: string, composes: readonly string[]): Promise<void> {
  await mutate(path, (lines) => {
    const block = findUnit(locateUnits(lines), id);
    const next = [...lines];

    for (let index = block.start; index < block.end; index += 1) {
      const line = next[index] ?? "";
      if (!/^\s*composes\s*=/.test(line)) continue;

      // Single-line array is the file's idiom; a multi-line composes spans to its closing `]`.
      let spanEnd = index;
      while (!(next[spanEnd] ?? "").includes("]") && spanEnd < block.end) spanEnd += 1;
      next.splice(index, spanEnd - index + 1, `composes = ${tomlList(composes)}`);
      return next;
    }

    // No composes line yet — insert directly after `row`.
    for (let index = block.start; index < block.end; index += 1) {
      if (/^\s*row\s*=/.test(next[index] ?? "")) {
        next.splice(index + 1, 0, `composes = ${tomlList(composes)}`);
        return next;
      }
    }
    throw new LedgerError(`unit "${id}" has no composes or row line to anchor on`);
  });
}

async function setLevel(path: string, id: string, level: string): Promise<void> {
  if (!LEVELS.includes(level)) {
    throw new LedgerError(`set-level: "${level}" is not one of ${LEVELS.join("|")}`);
  }
  await mutate(path, (lines) => {
    const block = findUnit(locateUnits(lines), id);
    const next = [...lines];
    for (let index = block.start; index < block.end; index += 1) {
      if (/^\s*level\s*=/.test(next[index] ?? "")) {
        next[index] = `level = ${toml(level)}`;
        return next;
      }
    }
    throw new LedgerError(`unit "${id}" has no level line`);
  });
}

/** Rename a unit id AND every composes reference to it — a rename that leaves dangling
 *  references would fail the lattice, so the fixup is mechanical, never manual. */
async function rename(path: string, oldId: string, newId: string): Promise<void> {
  await mutate(path, (lines) => {
    const blocks = locateUnits(lines);
    findUnit(blocks, oldId);
    if (blocks.some((block) => block.id === newId)) {
      throw new LedgerError(`rename: unit "${newId}" already exists`);
    }
    const next = [...lines];
    for (const block of blocks) {
      for (let index = block.start; index < block.end; index += 1) {
        const line = next[index] ?? "";
        if (block.id === oldId && /^\s*id\s*=/.test(line)) {
          next[index] = `id = ${toml(newId)}`;
        }
        if (/^\s*composes\s*=/.test(line) && block.composes.includes(oldId)) {
          next[index] = `composes = ${tomlList(block.composes.map((ref) => (ref === oldId ? newId : ref)))}`;
        }
      }
    }
    return next;
  });
}

async function note(path: string, id: string, text: string): Promise<void> {
  await mutate(path, (lines) => {
    const block = findUnit(locateUnits(lines), id);
    return [...lines.slice(0, block.end), `# ${today()} ${text}`, ...lines.slice(block.end)];
  });
}

/** Single-file truth only; cross-plane checks belong to dev/gates/lattice.ts. */
async function validate(path: string): Promise<string> {
  const text = (await readLines(path)).join("\n");
  parseOrThrow(text, path);

  const blocks = locateUnits(text.split("\n"));
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const rowClaims = new Map<string, string>();

  for (const block of blocks) {
    if (block.id === "") problems.push(`unit at line ${block.start + 1} has no id`);
    if (seenIds.has(block.id)) problems.push(`duplicate unit id "${block.id}"`);
    seenIds.add(block.id);

    if (!LEVELS.includes(block.level)) {
      problems.push(`unit ${block.id}: level "${block.level}" is not one of ${LEVELS.join("|")}`);
    }
    if (block.row === "") {
      problems.push(`unit ${block.id}: no row — declare-then-earn requires a matrix row`);
    } else {
      const prior = rowClaims.get(block.row);
      // Lattice's set-based checks cannot see this: two units claiming one row would both pass
      // "every unit names an existing row" and "every row is named by some unit".
      if (prior !== undefined) problems.push(`row "${block.row}" claimed by both ${prior} and ${block.id}`);
      rowClaims.set(block.row, block.id);
    }
  }

  if (problems.length > 0) throw new LedgerError(problems.join("\n"));
  return `${path}: valid · ${blocks.length} units`;
}

// ── selftest ──────────────────────────────────────────────────────────────────────────────────

async function selftest(): Promise<number> {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "manifest-selftest-"));
  const path = join(dir, "manifest.toml");

  const seed = [
    "# ═══ HEADER — this comment is the memory and must survive every write ═══",
    "",
    "[meta]",
    'package = "selftest"',
    "",
    "[[units]]",
    'id = "F-a"',
    'level = "foundation"',
    'row = "ROW-A"',
    "composes = []",
    'inputs = []',
    'outputs = ["a"]',
    'sources = ["s"]',
    "# 2026-01-01 seed note that must survive",
    "",
    "[[units]]",
    'id = "A-b"',
    'level = "adapter"',
    'row = "ROW-B"',
    'composes = ["F-a"]',
    "inputs = []",
    'outputs = ["b"]',
    'sources = ["s"]',
    "",
  ].join("\n");
  await Bun.write(path, seed);

  let passed = 0;
  let failed = 0;
  const check = async (name: string, run: () => Promise<boolean>): Promise<void> => {
    let ok = false;
    try {
      ok = await run();
    } catch {
      ok = false;
    }
    if (ok) passed += 1;
    else {
      failed += 1;
      console.error(`  FAIL ${name}`);
    }
  };

  const expectThrow = async (run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run();
      return false;
    } catch {
      return true;
    }
  };

  await check("validate passes on the seed", async () => (await validate(path)).includes("2 units"));
  await check("add lands a parseable unit", async () => {
    await add(path, { id: "F-new", level: "foundation", row: "ROW-N", composes: [], inputs: ["i"], outputs: ["o"], sources: ["s"], note: "slot note" });
    return (await validate(path)).includes("3 units");
  });
  await check("add inserts after the last unit of its level", async () => {
    const blocks = locateUnits(await readLines(path));
    const ids = blocks.map((block) => block.id);
    return JSON.stringify(ids) === JSON.stringify(["F-a", "F-new", "A-b"]);
  });
  await check("header comment survives writes", async () =>
    (await readLines(path)).join("\n").includes("this comment is the memory"));
  await check("seed # note survives writes", async () =>
    (await readLines(path)).join("\n").includes("seed note that must survive"));
  await check("add refuses a duplicate id", () =>
    expectThrow(() => add(path, { id: "F-a", level: "foundation", row: "ROW-X", composes: [], inputs: [], outputs: [], sources: [], note: null })));
  await check("add refuses an unknown level", () =>
    expectThrow(() => add(path, { id: "X", level: "canvas", row: "ROW-X", composes: [], inputs: [], outputs: [], sources: [], note: null })));
  await check("add refuses a missing row", () =>
    expectThrow(() => add(path, { id: "X", level: "adapter", row: "", composes: [], inputs: [], outputs: [], sources: [], note: null })));
  await check("set-composes replaces the line", async () => {
    await setComposes(path, "A-b", []);
    const block = findUnit(locateUnits(await readLines(path)), "A-b");
    return block.composes.length === 0;
  });
  await check("set-composes restores a reference", async () => {
    await setComposes(path, "A-b", ["F-a"]);
    const block = findUnit(locateUnits(await readLines(path)), "A-b");
    return block.composes.length === 1 && block.composes[0] === "F-a";
  });
  await check("set-composes refuses an unknown unit", () => expectThrow(() => setComposes(path, "ghost", [])));
  await check("set-level re-levels a unit", async () => {
    await setLevel(path, "A-b", "composite");
    return findUnit(locateUnits(await readLines(path)), "A-b").level === "composite";
  });
  await check("set-level refuses an unknown level", () => expectThrow(() => setLevel(path, "A-b", "canvas")));
  await check("rename fixes composes references", async () => {
    await setLevel(path, "A-b", "adapter");
    await rename(path, "F-a", "F-alpha");
    const blocks = locateUnits(await readLines(path));
    const dependent = findUnit(blocks, "A-b");
    return blocks.some((unit) => unit.id === "F-alpha") && dependent.composes.includes("F-alpha") && !dependent.composes.includes("F-a");
  });
  await check("rename refuses a taken id", () => expectThrow(() => rename(path, "F-alpha", "A-b")));
  await check("rename preserves comments", async () => {
    await rename(path, "F-alpha", "F-a");
    return (await readLines(path)).join("\n").includes("seed note that must survive");
  });
  await check("note appends a dated line inside the block", async () => {
    await note(path, "F-a", "hello from selftest");
    const lines = await readLines(path);
    const block = findUnit(locateUnits(lines), "F-a");
    return lines.slice(block.start, block.end).some((line) => line.includes("hello from selftest"));
  });
  await check("get returns the block", async () => (await get(path, "F-a")).includes('id = "F-a"'));
  await check("validate catches a duplicated row claim", async () => {
    await add(path, { id: "F-dup", level: "foundation", row: "ROW-A", composes: [], inputs: [], outputs: [], sources: [], note: null });
    return expectThrow(() => validate(path));
  });

  console.log("manifest selftest");
  console.log(`${passed}/${passed + failed} checks passed`);
  return failed === 0 ? 0 : 1;
}

// ── entry ─────────────────────────────────────────────────────────────────────────────────────

function flagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1] !== undefined) values.push(argv[index + 1] as string);
  }
  return values;
}

function usage(): string {
  return [
    "usage: bun dev/manifest.ts <manifest.toml> <command> [args]",
    "",
    "read",
    "  list                              units with level, row and composes",
    "  get <ID>                          one unit block (costs a block, not the file)",
    "",
    "write",
    "  add --id I --level L --row R [--composes a,b] [--input S]... [--output S]... [--source S]... [--note S]",
    "  set-composes <ID> <csv|none>      replace the composes edge",
    "  set-level <ID> <level>            re-level a unit (the lattice re-judges every edge)",
    "  rename <OLD> <NEW>                rename a unit id, fixing composes references mechanically",
    "  note <ID> \"text\"                  append a dated # note (never rewrites history)",
    "",
    "check",
    "  validate                          single-file truth; cross-plane checks are dev/gates/lattice.ts",
    "  selftest                          exercise the CLI against a temporary manifest",
  ].join("\n");
}

if (import.meta.main) {
  const [, , pathArg, command, ...rest] = Bun.argv;
  try {
    if (command === "selftest") {
      process.exit(await selftest());
    }
    if (pathArg === undefined || command === undefined) {
      console.log(usage());
      process.exit(pathArg === undefined ? 1 : 0);
    }

    switch (command) {
      case "list":
        console.log(await list(pathArg));
        break;
      case "get": {
        const id = rest[0];
        if (id === undefined) throw new LedgerError("get: which unit?");
        console.log(await get(pathArg, id));
        break;
      }
      case "add": {
        const args: AddArgs = {
          id: flagValues(rest, "--id")[0] ?? "",
          level: flagValues(rest, "--level")[0] ?? "",
          row: flagValues(rest, "--row")[0] ?? "",
          composes: (flagValues(rest, "--composes")[0] ?? "")
            .split(",")
            .map((piece) => piece.trim())
            .filter((piece) => piece !== ""),
          inputs: flagValues(rest, "--input"),
          outputs: flagValues(rest, "--output"),
          sources: flagValues(rest, "--source"),
          note: flagValues(rest, "--note")[0] ?? null,
        };
        await add(pathArg, args);
        console.log(`added ${args.id}`);
        break;
      }
      case "set-composes": {
        const [id, spec] = rest;
        if (id === undefined || spec === undefined) {
          throw new LedgerError('set-composes: usage is set-composes <ID> <csv|none>');
        }
        const composes =
          spec === "none"
            ? []
            : spec.split(",").map((piece) => piece.trim()).filter((piece) => piece !== "");
        await setComposes(pathArg, id, composes);
        console.log(`${id}: composes = [${composes.join(", ")}]`);
        break;
      }
      case "set-level": {
        const [id, level] = rest;
        if (id === undefined || level === undefined) {
          throw new LedgerError("set-level: usage is set-level <ID> <level>");
        }
        await setLevel(pathArg, id, level);
        console.log(`${id}: level = ${level}`);
        break;
      }
      case "rename": {
        const [oldId, newId] = rest;
        if (oldId === undefined || newId === undefined) {
          throw new LedgerError("rename: usage is rename <OLD> <NEW>");
        }
        await rename(pathArg, oldId, newId);
        console.log(`${oldId} → ${newId} (composes references fixed)`);
        break;
      }
      case "note": {
        const [id, text] = rest;
        if (id === undefined || text === undefined) throw new LedgerError('note: usage is note <ID> "text"');
        await note(pathArg, id, text);
        console.log(`${id}: note appended`);
        break;
      }
      case "validate":
        console.log(await validate(pathArg));
        break;
      default:
        console.log(usage());
        process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof LedgerError ? error.message : error);
    process.exit(1);
  }
}
