// ── scripts/wall.mjs — the wall's invocation, made SELF-CLEANING ─────────────
// `npm run typecheck:wall` builds the eight package programs, and `tsc -b` is a
// BUILD: it writes declarations. That is harmless while it SUCCEEDS — the output
// lands under `.tsbuild/`, which no walk counts. It is not harmless when it
// FAILS, and that asymmetry is the whole reason this file exists.
//
// MEASURED: a file that violates its project's `rootDir` cannot have its output
// placed under `outDir`, so tsc emits the `.js`/`.d.ts` BESIDE THE SOURCE. Six
// such files survived one red run, and the NEXT `npm test` was then red on
// byte-identical source — eslint's project service refuses a stray `.d.ts`
// ("was not found by the project service"), biome counted three extra files, and
// the citation census reads `.d.ts` as `.ts` and overshot its pinned total. A
// gate whose verdict depends on whether it was previously exercised is not a
// gate, so the sweep is part of the wall rather than an operator's chore.
//
// The sweep runs BEFORE tsc as well as after: a SIGKILLed or abandoned earlier
// run leaves exactly the same droppings, and this run must not inherit them.
// BOTH halves are rooted at the REPOSITORY, not this workspace, and the
// inherited half is keyed on the emission's SHAPE rather than a location list —
// an adversarial advocate defeated the earlier cwd-rooted, glob-scoped version
// twice, each time leaving a dropping that flipped `npm test` red permanently
// on byte-identical source. See the two block comments below.
//
// `.tsbuild` is pruned rather than reused because `tsc -b --force` does not
// prune stale output: measured, a compiled `*.test.js` survived `--force`, and
// vitest's discovery then EXECUTED it as an extra test file. vitest.config.ts
// excludes that directory too; this prune is the half that keeps it empty.
//
// TWO NON-ANSWERS, both measured on a clean tree so nobody re-proposes them:
// `--noEmit` is 13 × TS6310 and exit 2 (a composite project may not disable
// emit), and `emitDeclarationOnly` only halves six droppings to three `.d.ts` —
// the half that breaks eslint and inflates the census. The fix is to remove the
// emission, not to teach the detectors to ignore it.
//
// `.mjs` is deliberate: the citation lint's EXTENSIONS list has no `.mjs`, so
// this helper does not move the file census the way a `.ts` or `.js` would.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The REPO ROOT, not the workspace. `tsc -b` emits beside whatever out-of-root
 *  file a violating import reached, and one extra `../` puts that file above
 *  `examples/typescript` — measured: a probe importing `wiki/example/agentd.js`
 *  left `wiki/example/agentd.d.ts` behind, outside a cwd-rooted walk, where it
 *  flipped the citation census red PERMANENTLY on byte-identical source. A
 *  sweep rooted at the workspace closes only the sub-class it was tested on. */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

/** Directories no emission can hide in and every walk skips: build output, the
 *  package store, git's own tree, and agent worktrees. */
const SKIP = new Set([".tsbuild", "node_modules", ".git", ".gradle", "build", ".claude"]);

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

/** Every file under the repo root outside the skipped trees — the snapshot the
 *  post-build sweep diffs against. Deleting only what is NEW after `tsc -b`
 *  closes the emitted-dropping class without enumerating locations. */
function snapshot() {
  const out = new Set();
  walk(REPO, (file) => out.add(file));
  return out;
}

/** THE INHERITED-DROPPING RULE, and why it is a FORM rather than a glob list.
 *
 *  A snapshot cannot tell a dropping left by an ABANDONED earlier run (SIGKILL,
 *  a bare `tsc -b`) from a real file: it is already there when the run starts,
 *  so `before` records it and the post-sweep spares it forever. The previous
 *  answer was a `src/**` + `test/**` glob pair, which is the enumeration this
 *  file exists to replace — measured, it was blind to root-level emit and the
 *  poisoning survived every subsequent green run.
 *
 *  So an inherited dropping is recognised by its SHAPE, and the shape is
 *  SIBLINGHOOD rather than extension: `tsc` writes `foo.d.ts` / `foo.js` BESIDE
 *  the `foo.ts` (or, under `allowJs`, the `foo.js`) it could not place under
 *  `outDir`. So an emitted file always has a same-base-name source beside it.
 *
 *  That distinction is load-bearing, not fastidious. An adversarial prosecutor
 *  deleted three legitimate files with the cruder rule: `tsconfig.base.json`
 *  sets `allowJs`, so a hand-written `.js` under `src/` is real source, and a
 *  hand-written ambient `ambient.d.ts` is idiomatic and inside the wall program.
 *  Neither has a same-base sibling, so neither is touched. Worse than the data
 *  loss, deleting an ambient declaration INVERTED THE WALL'S OWN VERDICT — the
 *  build then failed on a module the deleted file declared, a red the source
 *  did not earn.
 *
 *  What the rule still assumes: no committed file is named `<x>.d.ts` beside an
 *  `<x>.ts`/`<x>.js`, and none is a `.js` beside an `<x>.ts`. Measured true over
 *  the whole tree, and ASSERTED by the gate (test/gate/gate.test.ts), so the
 *  assumption cannot quietly stop holding. */
const EMITTED = [".d.ts", ".d.ts.map", ".js", ".js.map", ".tsbuildinfo"];

/** the source file `tsc` would have emitted this beside, or null */
function emissionSource(file) {
  for (const ext of [".d.ts.map", ".d.ts", ".js.map", ".js"]) {
    if (!file.endsWith(ext)) continue;
    const base = file.slice(0, -ext.length);
    if (existsSync(`${base}.ts`)) return `${base}.ts`;
    // `.d.ts` is also emitted beside a `.js` when `allowJs` is on
    if (ext.startsWith(".d.ts") && existsSync(`${base}.js`)) return `${base}.js`;
    return null;
  }
  return null;
}

function inheritedDroppings() {
  const found = [];
  walk(REPO, (file) => {
    if (emissionSource(file) !== null) found.push(file);
  });
  return found;
}

rmSync(".tsbuild", { recursive: true, force: true });
for (const stray of inheritedDroppings()) rmSync(stray, { force: true });
const before = snapshot();
// stdio inherited: the real TS diagnostics must reach the operator verbatim,
// because the diagnostic IS this gate's output. Only the droppings are swept.
const built = spawnSync("tsc", ["-b", "--force", "tsconfig.wall.json"], {
  stdio: "inherit",
  shell: true,
});
// ONLY what `tsc` can emit. The window between the two snapshots belongs to the
// build, but not exclusively: a prosecutor saved an editor file and wrote a
// coverage report inside it and the sweep destroyed both. Authorship cannot be
// read off the filesystem, so the sweep claims only files with an extension
// `tsc` writes AND a source sibling to have been written beside — everything
// else that appeared is somebody else's and is left alone.
for (const file of snapshot()) {
  if (before.has(file)) continue;
  if (!EMITTED.some((ext) => file.endsWith(ext))) continue;
  if (!file.endsWith(".tsbuildinfo") && emissionSource(file) === null) continue;
  rmSync(file, { force: true });
}
process.exit(built.status ?? 1);
