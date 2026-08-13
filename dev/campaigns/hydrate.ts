#!/usr/bin/env bun
/**
 * HARNESS-6 — ledger-as-gym exhaust (one-way).
 *
 *   bun dev/campaigns/hydrate.ts <ledger.toml> <ID> [--out dir]
 *
 * Deposits a gym environment for a closed campaign item:
 *   declaration, item-scoped notes, review traces, honesty-reconcile notes,
 *   and a scoped diff if the item names files[].
 *
 * SELF-CONTAMINATION LAW: never generate corrupted variants here.
 * Default out: dev/earn-artifacts/gym-exhaust/<id>/
 * Idempotent: second run with same content does not duplicate deposits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  findBlock,
  locateItems,
  notesOf,
  readLines,
  LedgerError,
} from "./ledger-core.ts";
import { parseReviews } from "./earn-core.ts";

const USAGE = `usage: bun dev/campaigns/hydrate.ts <ledger.toml> <ID> [--out dir]

  Deposit a one-way gym exhaust for a done|verified item.
  --out defaults to dev/earn-artifacts/gym-exhaust/<ID>/

  selftest   exercise idempotency + negative labeling
`;

function flag(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : (argv[i + 1] ?? null);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function repoRoot(): string {
  return Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
  })
    .stdout.toString()
    .trim();
}

function headSha(root: string): string {
  return Bun.spawnSync(["git", "-C", root, "rev-parse", "--short", "HEAD"], {
    stdout: "pipe",
  })
    .stdout.toString()
    .trim();
}

async function hydrate(
  ledgerPath: string,
  id: string,
  outRoot: string | null,
): Promise<number> {
  const root = repoRoot();
  const lines = await readLines(ledgerPath);
  const block = findBlock(locateItems(lines), id);
  const { item } = block;
  if (item.status !== "done" && item.status !== "verified") {
    throw new LedgerError(
      `hydrate refused: ${id} is ${item.status} — only done|verified items exhaust`,
    );
  }

  const notes = notesOf(lines, block);
  const reviews = parseReviews(notes);
  const isNegative = notes.some(
    (n) =>
      /honest(y)?[- ]reconcile/i.test(n) ||
      /RESIDUAL vs verify/i.test(n) ||
      /overclaim/i.test(n),
  );

  const declaration = {
    id: item.id,
    phase: item.phase,
    title: item.title,
    files: item.files,
    status: item.status,
    verify: item.verify,
    sha: headSha(root),
    hydratedAt: new Date().toISOString(),
    label: isNegative ? "negative" : "positive",
  };

  const base =
    outRoot ?? join(root, "dev/earn-artifacts/gym-exhaust", id);
  mkdirSync(base, { recursive: true });

  // Hash stable content only (exclude wall-clock hydratedAt).
  const stable = {
    id: item.id,
    phase: item.phase,
    title: item.title,
    files: item.files,
    status: item.status,
    verify: item.verify,
    sha: declaration.sha,
    label: declaration.label,
    notes,
    reviews,
  };
  const digest = sha256(JSON.stringify(stable));
  const stampPath = join(base, "deposit.sha256");
  if (existsSync(stampPath) && readFileSync(stampPath, "utf8").trim() === digest) {
    console.log(`${id}: hydrate idempotent (unchanged ${digest})`);
    return 0;
  }

  const body = JSON.stringify({ declaration, notes, reviews, files: item.files }, null, 2) + "\n";
  writeFileSync(join(base, "declaration.json"), JSON.stringify(declaration, null, 2) + "\n");
  writeFileSync(join(base, "notes.txt"), notes.join("\n") + (notes.length ? "\n" : ""));
  writeFileSync(join(base, "deposit.json"), body);
  writeFileSync(stampPath, digest + "\n");

  // Optional scoped diff — best-effort against HEAD for named files
  if (item.files.length > 0) {
    const args = ["-C", root, "log", "-1", "-p", "--", ...item.files];
    const diff = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
    const text = diff.stdout.toString();
    if (text.trim()) writeFileSync(join(base, "scoped-diff.patch"), text);
  }

  // Copy review artifacts if they still exist
  for (const r of reviews) {
    if (existsSync(r.artifact)) {
      const name = `review-${r.n}-${r.verdict}.txt`;
      writeFileSync(join(base, name), readFileSync(r.artifact));
    }
  }

  if (isNegative) {
    writeFileSync(join(base, "LABEL"), "negative\n");
  }

  console.log(
    `${id}: hydrated → ${base} (${declaration.label}, sha=${declaration.sha}, ${digest})`,
  );
  return 0;
}

function selftest(): number {
  let fails = 0;
  const check = (l: string, ok: boolean) => {
    if (!ok) {
      console.error(`FAIL ${l}`);
      fails++;
    }
  };
  const dir = `${process.env.TMPDIR ?? "/tmp"}/hydrate-selftest-${process.pid}`;
  mkdirSync(dir, { recursive: true });
  const ledger = join(dir, "L.toml");
  writeFileSync(
    ledger,
    `# hydrate selftest
[[items]]
id = "H1"
phase = "p"
title = "closed item"
files = []
status = "done"
verify = "v"
# 2026-08-07 RESIDUAL vs verify: honesty-reconcile fixture
`,
  );
  const out = join(dir, "out");
  // run hydrate twice
  const run = () =>
    Bun.spawnSync(
      ["bun", import.meta.path, ledger, "H1", "--out", out],
      { stdout: "pipe", stderr: "pipe" },
    );
  const a = run();
  const b = run();
  check("first hydrate ok", a.exitCode === 0);
  check("second idempotent", b.exitCode === 0 && b.stdout.toString().includes("idempotent"));
  check("negative label", existsSync(join(out, "LABEL")));
  check("declaration present", existsSync(join(out, "declaration.json")));
  // refuse open item
  writeFileSync(
    ledger,
    `[[items]]
id = "H2"
phase = "p"
title = "open"
files = []
status = "todo"
verify = "v"
`,
  );
  const c = Bun.spawnSync(["bun", import.meta.path, ledger, "H2", "--out", join(dir, "x")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  check("open item refused", c.exitCode !== 0);
  console.log(fails === 0 ? "hydrate selftest ok" : `hydrate selftest ${fails} fail(s)`);
  return fails === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  const argv = Bun.argv.slice(2);
  if (argv[0] === "selftest") return selftest();
  if (argv[0] === "help" || !argv[0] || !argv[1]) {
    console.log(USAGE);
    return argv[0] === "help" ? 0 : 1;
  }
  return hydrate(argv[0]!, argv[1]!, flag(argv, "out"));
}

try {
  process.exit(await main());
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
