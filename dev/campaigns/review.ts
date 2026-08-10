#!/usr/bin/env bun
/**
 * REVIEW-CLEAN protocol (HARNESS-3) — orchestrator-spawned SUBAGENTS only.
 *
 * NOT a headless Claude CLI runner. The orchestrator seat:
 *   1. `prepare <ID> --diff <range>`  → brief file + spawn instructions
 *   2. Agent tool with that brief (fresh subagent; diff-only context in the brief)
 *   3. `record <ID> --verdict clean|findings --artifact <path>`
 *   4. repeat until MIN_CLEAN_REVIEWS clean or MAX_REVIEWS_PER_TARGET hit
 *   5. matrix/ledger `earn` for slug review-clean reads these records
 *
 * Cap: 3 review sessions per target (item or matrix row id).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import {
  MAX_REVIEWS_PER_TARGET,
  MIN_CLEAN_REVIEWS,
  formatReviewNote,
  isoNow,
  parseReviews,
  reviewCleanSatisfied,
  artifactDir,
} from "./earn-core.ts";
import { mutate, readLines, LedgerError } from "./ledger-core.ts";
import { LEDGER, MATRIX } from "../../.claude/hooks/repo.ts";

const USAGE = `usage: bun dev/campaigns/review.ts <command> [args]

  prepare <ID> --diff <git-range> [--ledger path] [--matrix path]
      Write a subagent brief (diff-only). Prints SPAWN instructions for the orchestrator.
      Does NOT call Claude. You spawn Agent() with the brief.

  record <ID> --verdict clean|findings --artifact <path> [--ledger path] [--matrix path]
      Append a review:N diary note on the ledger item and/or matrix row.
      Refuses when ${MAX_REVIEWS_PER_TARGET} sessions already recorded.

  status <ID> [--ledger path] [--matrix path]
      How many reviews, whether review-clean is satisfied.

  selftest
      Cap + clean-threshold checks.

OPERATOR RULES
  · Max ${MAX_REVIEWS_PER_TARGET} subagent review sessions per ID
  · review-clean needs >= ${MIN_CLEAN_REVIEWS} clean verdicts and zero findings
  · Subagents get the brief file only — no "implementer rationale" channel
`;

function flag(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : (argv[i + 1] ?? null);
}

function repoRoot(): string {
  return Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
  }).stdout.toString().trim();
}

// FOUND DURING THE PORT, PROMOTE UPSTREAM. These two read from .claude/hooks/repo.ts
// rather than re-spelling the paths. A duplicated ledger constant is the exact failure
// repo.ts was extracted to kill: a vendoring updates the copies it can see, misses this
// one, and the miss is SILENT — a default that resolves to a file which is not the
// campaign simply reports an empty review.
function defaultLedger(root: string): string {
  return `${root}/${LEDGER}`;
}

function defaultMatrix(root: string): string {
  return `${root}/${MATRIX}`;
}

/** Notes from a TOML block whose id= field matches. */
function notesForId(lines: readonly string[], id: string, header: RegExp): string[] {
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!header.test(lines[i] ?? "")) continue;
    let e = i + 1;
    while (e < lines.length && !/^\s*\[/.test(lines[e] ?? "")) e++;
    let last = e;
    while (last > i + 1 && (lines[last - 1] ?? "").trim() === "") last--;
    const body = lines.slice(i, last);
    const idLine = body.find((l) => /^\s*id\s*=/.test(l));
    const m = idLine?.match(/id\s*=\s*"([^"]+)"/);
    if (m?.[1] === id) {
      start = i;
      end = last;
      break;
    }
  }
  if (start < 0) return [];
  return lines
    .slice(start, end)
    .filter((l) => l.trimStart().startsWith("#"))
    .map((l) => l.trim());
}

function appendNoteToId(
  lines: readonly string[],
  id: string,
  header: RegExp,
  note: string,
): string[] {
  const next = [...lines];
  for (let i = 0; i < next.length; i++) {
    if (!header.test(next[i] ?? "")) continue;
    let e = i + 1;
    while (e < next.length && !/^\s*\[/.test(next[e] ?? "")) e++;
    let last = e;
    while (last > i + 1 && (next[last - 1] ?? "").trim() === "") last--;
    const body = next.slice(i, last);
    const idLine = body.find((l) => /^\s*id\s*=/.test(l));
    const m = idLine?.match(/id\s*=\s*"([^"]+)"/);
    if (m?.[1] !== id) continue;
    next.splice(last, 0, note);
    return next;
  }
  throw new LedgerError(`no block with id "${id}"`);
}

async function collectReviews(
  id: string,
  ledgerPath: string | null,
  matrixPath: string | null,
): Promise<ReturnType<typeof parseReviews>> {
  const notes: string[] = [];
  if (ledgerPath && existsSync(ledgerPath)) {
    notes.push(...notesForId(await readLines(ledgerPath), id, /^\[\[items\]\]\s*$/));
  }
  if (matrixPath && existsSync(matrixPath)) {
    notes.push(...notesForId(await readLines(matrixPath), id, /^\[\[rows\]\]\s*$/));
  }
  return parseReviews(notes);
}

async function main(): Promise<number> {
  const argv = Bun.argv.slice(2);
  const command = argv[0];
  if (!command || command === "help") {
    console.log(USAGE);
    return command === "help" ? 0 : 1;
  }
  if (command === "selftest") return selftest();

  const root = repoRoot();
  const rest = argv.slice(1);
  const ledgerPath = flag(rest, "ledger") ?? defaultLedger(root);
  const matrixPath = flag(rest, "matrix") ?? defaultMatrix(root);

  if (command === "prepare") {
    const id = rest[0];
    const diff = flag(rest, "diff");
    if (!id || !diff) {
      throw new LedgerError("prepare requires <ID> --diff <range>");
    }
    const existing = await collectReviews(id, ledgerPath, matrixPath);
    if (existing.length >= MAX_REVIEWS_PER_TARGET) {
      throw new LedgerError(
        `${id}: review cap ${MAX_REVIEWS_PER_TARGET} already reached — cannot prepare another session`,
      );
    }
    const n = existing.length + 1;
    const dir = artifactDir(root, "reviews");
    mkdirSync(dir, { recursive: true });
    const diffOut = Bun.spawnSync(["git", "diff", diff], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const diffText = diffOut.stdout.toString();
    if (diffText.trim() === "") {
      throw new LedgerError(`empty diff for range "${diff}" — refuse vacuous review`);
    }
    // Oversized: ~200k chars is too big to review honestly in one unit
    if (diffText.length > 200_000) {
      throw new LedgerError(
        `diff is ${diffText.length} bytes — too large for one review unit; split the change`,
      );
    }
    const briefPath = `${dir}/${id}-${n}-brief.md`;
    const brief = `# Review brief for ${id} (session ${n}/${MAX_REVIEWS_PER_TARGET})

You are an adversarial reviewer subagent. Your ENTIRE context is this brief and the diff below.
Do NOT assume implementer intent. Default-deny: find real defects.

## Rules
- Refute with file:line when possible
- Verdict must be exactly one of: CLEAN or FINDINGS
- If FINDINGS: list each as \`- file:line — claim\`
- No praise padding. No "looks good overall" without CLEAN.

## Diff (\`${diff}\`)

\`\`\`diff
${diffText}
\`\`\`

## Output format (raw text)
VERDICT: CLEAN
or
VERDICT: FINDINGS
- path:line — …

When done, the orchestrator will write your output to an artifact and run:
  bun dev/campaigns/review.ts record ${id} --verdict … --artifact …
`;
    writeFileSync(briefPath, brief);
    console.log(`brief: ${briefPath}`);
    console.log(``);
    console.log(`═══ ORCHESTRATOR: SPAWN SUBAGENT (not headless CLI) ═══`);
    console.log(`Agent({`);
    console.log(`  description: "review ${id} #${n}",`);
    console.log(`  prompt: readFile("${briefPath}") + " Return VERDICT line first.",`);
    console.log(`  // fresh agent — do not pass implementer rationale`);
    console.log(`})`);
    console.log(`Then save the subagent's final text to an artifact and:`);
    console.log(
      `  bun dev/campaigns/review.ts record ${id} --verdict clean|findings --artifact <path>`,
    );
    console.log(`══════════════════════════════════════════════════════`);
    return 0;
  }

  if (command === "record") {
    const id = rest[0];
    const verdict = flag(rest, "verdict");
    const artifact = flag(rest, "artifact");
    if (!id || !verdict || !artifact) {
      throw new LedgerError("record requires <ID> --verdict clean|findings --artifact <path>");
    }
    if (verdict !== "clean" && verdict !== "findings") {
      throw new LedgerError("--verdict must be clean or findings");
    }
    if (!existsSync(artifact)) {
      throw new LedgerError(`artifact not found: ${artifact}`);
    }
    // Fail-closed: unparseable / empty artifact
    const body = readFileSync(artifact, "utf8");
    if (body.trim().length < 8) {
      throw new LedgerError("artifact too thin to be a real review output");
    }
    if (verdict === "clean" && !/VERDICT:\s*CLEAN/i.test(body) && !/\bCLEAN\b/.test(body)) {
      // soft warn — orchestrator may have summarized
    }
    const existing = await collectReviews(id, ledgerPath, matrixPath);
    if (existing.length >= MAX_REVIEWS_PER_TARGET) {
      throw new LedgerError(`${id}: already at max ${MAX_REVIEWS_PER_TARGET} reviews`);
    }
    const n = existing.length + 1;
    const note = formatReviewNote({
      n,
      verdict,
      artifact,
      at: isoNow(),
    });
    // Prefer ledger item if present, else matrix row
    let wrote = false;
    if (existsSync(ledgerPath)) {
      const lines = await readLines(ledgerPath);
      try {
        notesForId(lines, id, /^\[\[items\]\]\s*$/);
        // throws if missing when we append
        await mutate(ledgerPath, (cur) => appendNoteToId(cur, id, /^\[\[items\]\]\s*$/, note));
        wrote = true;
        console.log(`${id}: review ${n}/${MAX_REVIEWS_PER_TARGET} recorded on ledger (${verdict})`);
      } catch {
        /* not a ledger id */
      }
    }
    if (existsSync(matrixPath)) {
      try {
        await mutate(matrixPath, (cur) => appendNoteToId(cur, id, /^\[\[rows\]\]\s*$/, note));
        wrote = true;
        console.log(`${id}: review ${n}/${MAX_REVIEWS_PER_TARGET} recorded on matrix (${verdict})`);
      } catch {
        /* not a matrix id */
      }
    }
    if (!wrote) throw new LedgerError(`id "${id}" not found in ledger or matrix`);
    const after = await collectReviews(id, ledgerPath, matrixPath);
    const sat = reviewCleanSatisfied(after);
    console.log(sat.ok ? `review-clean: SATISFIED (${sat.detail})` : `review-clean: not yet — ${sat.detail}`);
    return 0;
  }

  if (command === "status") {
    const id = rest[0];
    if (!id) throw new LedgerError("status requires <ID>");
    const reviews = await collectReviews(id, ledgerPath, matrixPath);
    const sat = reviewCleanSatisfied(reviews);
    console.log(`${id}: ${reviews.length}/${MAX_REVIEWS_PER_TARGET} review sessions`);
    for (const r of reviews) {
      console.log(`  #${r.n} ${r.verdict} ${r.artifact}`);
    }
    console.log(sat.ok ? `review-clean: YES — ${sat.detail}` : `review-clean: NO — ${sat.detail}`);
    return sat.ok ? 0 : 1;
  }

  console.log(USAGE);
  return 1;
}

function selftest(): number {
  let fails = 0;
  const check = (l: string, ok: boolean) => {
    if (!ok) {
      console.error(`FAIL ${l}`);
      fails++;
    }
  };
  check("cap is 3", MAX_REVIEWS_PER_TARGET === 3);
  check("min clean is 2", MIN_CLEAN_REVIEWS === 2);
  check(
    "0 clean fails",
    !reviewCleanSatisfied([]).ok,
  );
  check(
    "1 clean fails",
    !reviewCleanSatisfied([
      { n: 1, verdict: "clean", artifact: "a", at: "t" },
    ]).ok,
  );
  check(
    "2 clean ok",
    reviewCleanSatisfied([
      { n: 1, verdict: "clean", artifact: "a", at: "t" },
      { n: 2, verdict: "clean", artifact: "b", at: "t" },
    ]).ok,
  );
  check(
    "findings blocks",
    !reviewCleanSatisfied([
      { n: 1, verdict: "clean", artifact: "a", at: "t" },
      { n: 2, verdict: "findings", artifact: "b", at: "t" },
    ]).ok,
  );
  check(
    "4 reviews fails cap",
    !reviewCleanSatisfied([
      { n: 1, verdict: "clean", artifact: "a", at: "t" },
      { n: 2, verdict: "clean", artifact: "b", at: "t" },
      { n: 3, verdict: "clean", artifact: "c", at: "t" },
      { n: 4, verdict: "clean", artifact: "d", at: "t" },
    ]).ok,
  );
  console.log(fails === 0 ? "review selftest ok" : `review selftest ${fails} fail(s)`);
  return fails === 0 ? 0 : 1;
}

try {
  process.exit(await main());
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
