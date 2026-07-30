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
// Its scope is `src/**` AND `test/**`, because the emit lands beside the
// OUT-OF-ROOT file — measured at `test/harness.{js,d.ts}` and
// `test/support/stamp.{js,d.ts}`, which no `src/**` pattern reaches.
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
import { globSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** the src/test droppings an ABANDONED earlier run can leave behind — swept
 *  before the build, because the snapshot below cannot tell an inherited
 *  dropping from a real file. Deliberately NOT a root `*.js` glob: that would
 *  delete eslint.config.js. */
const DROPPINGS = ["src/**/*.js", "src/**/*.d.ts", "test/**/*.js", "test/**/*.d.ts"];

/** Every file outside `.tsbuild/` and `node_modules/` — the snapshot the
 *  post-build sweep diffs against. Review proved the glob list above is an
 *  ENUMERATION and a red build emits beside whatever out-of-root file was
 *  reached: a probe importing the ROOT-LEVEL vitest.config.ts left
 *  `vitest.config.{js,d.ts}` at the root, both globs blind, and the NEXT run's
 *  verdict changed on byte-identical source. Deleting only what is NEW after
 *  `tsc -b` closes the class without listing locations, and provably cannot
 *  delete real source. */
function snapshot(dir = ".", out = new Set()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".tsbuild" || entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) snapshot(full, out);
    else out.add(full);
  }
  return out;
}

rmSync(".tsbuild", { recursive: true, force: true });
for (const stray of globSync(DROPPINGS)) rmSync(stray, { force: true });
const before = snapshot();
// stdio inherited: the real TS diagnostics must reach the operator verbatim,
// because the diagnostic IS this gate's output. Only the droppings are swept.
const built = spawnSync("tsc", ["-b", "--force", "tsconfig.wall.json"], {
  stdio: "inherit",
  shell: true,
});
for (const file of snapshot()) {
  if (!before.has(file)) rmSync(file, { force: true });
}
process.exit(built.status ?? 1);
