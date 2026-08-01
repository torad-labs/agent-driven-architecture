// ── vitest.config.ts — `.tsbuild` is a walk too, and the only DANGEROUS one ──
// The wall's declaration output is excluded from .gitignore, from eslint's
// `ignores` and from both laws walks, so nothing miscounts it. vitest differs in
// kind: a stray compiled `*.test.js` under `.tsbuild/` is not miscounted, it is
// EXECUTED. Measured — a block test compiled there ran as a 24th test file and
// failed on a module path that only resolves from `src/`.
//
// The three entries below RESTATE vitest's defaults and add one. This option
// REPLACES the default `exclude` rather than extending it, so dropping
// node_modules or dist here would lose them.
//
// `.work/**` is the SAME kind of walk for the same reason. It is the G12
// negative-compilation harness's scratch copy, and since that copy carries
// `test/` as well as `src/` it holds a duplicate of every test file in the tree.
// The harness deletes it; an ABANDONED run does not, and vitest would then
// EXECUTE the duplicates against a program that only resolves from the real root.
//
// Defence in depth, not a replacement: `exclude: ["**/*.test.ts"]` in the eight
// package tsconfigs is what stops such a file being compiled in the first place,
// and scripts/wall.mjs prunes `.tsbuild` on every run so nothing accumulates.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".tsbuild/**",
      ".work/**",
      // A THIRD kind of walk, and the same danger as `.tsbuild`: the quickstart
      // walk's adopter template holds a REAL test file - it has to, running the
      // block test is one of the four beats - and from THIS root it would
      // execute against this port's packages instead of its own copy of the
      // tier. Scoped to that one segment rather than to `fixtures` at large,
      // which was measured to be wrong: laws.toml's in-checker rows name test
      // sites that legitimately live under a `fixtures` path, and denying them
      // here made the registry report every one as a file vitest never runs.
      "**/quickstart/**",
    ],
    // THE VERDICT MUST NOT DEPEND ON HOST LOAD. Six cases shell out to tsc, npm
    // or the demo runner, and under vitest's default 5000 ms per-test timeout
    // they go red on byte-identical pristine source whenever the machine is
    // contended — a gate that fails at random breeds exactly the re-run culture
    // §15.2 is written against. 60s is generous headroom, not a target: the
    // slowest observed case (the quickstart walk, cold) is well under half.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
