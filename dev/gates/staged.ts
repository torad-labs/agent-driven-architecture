#!/usr/bin/env bun
/**
 * SAME-CHECKER-TWICE — re-run the write-time walls against STAGED content.
 *
 * The write-time hook chain is the first line, and it has one structural weakness: it only runs
 * if it runs. Disable the hook, edit settings.json, run a tool that does not trigger PreToolUse,
 * apply a patch from outside the session — and every wall is silently absent. A chain that can be
 * turned off is advisory, and an advisory wall is not a wall.
 *
 * So the SAME modules run again here, against what git is actually about to record. Not a
 * reimplementation of the rules — the identical `registry` the hook uses. A second copy of the
 * rules would drift from the first, and the drift always lands in the direction of the weaker one
 * (concept #959: enforce structure twice from ONE checker source).
 *
 * Wire as a pre-commit gate:
 *   bun dev/gates/staged.ts
 *
 * WHAT THIS CANNOT DO, stated plainly rather than implied: it re-runs the PATH-shaped walls, which
 * is what catches a banned file arriving by any route. It cannot re-derive a content judgement for
 * an Edit, because a staged blob is a finished file, not a pending mutation. The content walls
 * remain a write-time-only line. Saying so here is cheaper than someone later assuming this gate
 * covers more than it does.
 */

import { registry } from "../../.claude/hooks/registry.ts";
import type { HookPayload } from "../../.claude/hooks/types.ts";

const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim();

/**
 * `-z`, AND THAT IS NOT A STYLE CHOICE.
 *
 * `git diff --cached --name-only` honours `core.quotePath`, which is ON by default. Any path with
 * a non-ASCII or control byte comes back C-quoted and octal-escaped:
 *
 *     dev/café.py   →   "dev/caf\303\251.py"      (with the quotes as literal characters)
 *
 * That defeats BOTH legs of this gate at once. `git show :"dev/caf\303\251.py"` fails, so the
 * content reads as empty; and the basename now ends in `"` rather than `.py`, so `classifyPath`
 * sees nothing to object to. A single accented filename walked a banned file straight past the
 * commit gate — reproduced, not theorised.
 *
 * `-z` emits raw NUL-separated paths with no quoting at all, so both legs see the real name.
 *
 * ACR filter: added, copied, renamed, modified. A deletion cannot violate a wall.
 */
const staged = (await Bun.$`git diff --cached --name-only -z --diff-filter=ACMR`.text())
  .split("\0")
  .filter((path) => path !== "");

if (staged.length === 0) {
  console.log("staged gate: nothing staged");
  process.exit(0);
}

const allWalls = registry.filter((entry) => entry.events.includes("PreToolUse"));

// FAIL-CLOSED CLASSIFICATION. A wall that has not declared its staged scope is a wall nobody
// decided about, and both possible guesses are wrong in a way that matters: assume "recheck" and
// legitimate commits start failing; assume "write-time-only" and the wall silently vanishes from
// the commit gate, which is the exact failure this gate exists to prevent. So: refuse to run.
const unclassified = allWalls.filter((wall) => wall.staged === undefined);
if (unclassified.length > 0) {
  console.error(
    `staged gate: ${unclassified.map((wall) => wall.name).join(", ")} did not declare a ` +
      `\`staged\` scope.\n\nEvery PreToolUse module must classify itself as "recheck" (judges ` +
      `what may EXIST — re-run it here) or "write-time-only" (judges HOW a seat may edit — the ` +
      `resulting file is legitimate). There is no default because neither guess is safe.`,
  );
  process.exit(1);
}

const walls = allWalls.filter((wall) => wall.staged === "recheck");
const failures: string[] = [];

for (const path of staged) {
  const absolute = `${root}/${path}`;

  // THE INDEX, NOT THE WORKTREE. Reading `Bun.file(absolute)` reads whatever happens to be on
  // disk right now, which is not what git is about to record. Proven false-negative: stage a file
  // whose content carries a python shebang, then overwrite the worktree copy with a bun shebang —
  // the gate printed "clean" and the python version was still committable. `git show :<path>`
  // reads the staged blob, which is the only thing this gate was ever supposed to judge.
  const content = await Bun.$`git show :${path}`.cwd(root).quiet().nothrow().text().catch(() => "");

  for (const wall of walls) {
    const payload: HookPayload = {
      tool_name: "Write",
      tool_input: { file_path: absolute, content },
      cwd: root,
    };

    const verdict = await wall.run(payload);
    if (verdict?.kind === "block") {
      failures.push(`${path}\n    [${wall.name}] ${verdict.reason.split("\n")[0] ?? ""}`);
    }
  }
}

if (failures.length === 0) {
  console.log(`staged gate: clean · ${staged.length} file(s) re-checked against ${walls.length} wall(s)`);
  process.exit(0);
}

console.error(`staged gate: ${failures.length} violation(s) in staged content\n`);
for (const failure of failures) console.error(`  ${failure}`);
console.error(
  `\nThese are the SAME walls the write-time hook runs. Reaching this message means the content ` +
    `got past the keyboard — a disabled hook, an out-of-session patch, or a tool that does not ` +
    `trigger PreToolUse. Fix the content; do not weaken either checker.`,
);
process.exit(1);
