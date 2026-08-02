// ── THE BUILD EDGE, MEASURED BY THE REAL COMPILER ─────────────────────────
//
// §15.3's fourth column now carries a CONFIGURATION-TIME rung, and a rung is a
// claim about a machine. This file is where that claim is measured rather than
// asserted: it copies the real source tree, drops a checked-in probe file INSIDE
// a block package, and runs the real compiler.
//
// WHY IT EXISTS. The first draft of the rung was awarded to the foreign-import
// law by reading the module graph and reasoning about it. Measured, that law's
// violating shape is refused at configuration time on ONE port and ACCEPTED on
// the other — a foreign library hoisted to the one root store resolves from
// inside a module that never declared it — so the printed cell would have
// promised a wall the reference port has not built. The rule that came out of
// that (laws.toml's FLOOR RULE) is only as good as a measurement, so here is one.
//
// THREE PROBES, and the middle one is why the first is worth anything:
//   cross-block-deep       a sibling block's INTERNALS   → must be REFUSED
//   cross-block-published  the one published subpath     → must RESOLVE
//   foreign-library        a library no manifest declares → must RESOLVE
// The refusal and its control ride the SAME test, so a refusal produced by an
// unrelated compiler failure cannot pass for a build edge. The third is a
// NEGATIVE WALL: if a later landing draws that edge, this goes red and the law's
// rung has to be re-earned instead of left stale.
//
// THE PACKAGE FARM IS LOAD-BEARING, for the same reason the exhaustiveness
// harness records: a copy without its own `@adr` links resolves every
// cross-package specifier back to the REAL tree, and the probe would then be
// measuring a directory nobody edited. The farm below points every `@adr/*` at
// the COPY. Everything else still resolves upward to the project's own store —
// which is precisely the fact the third probe measures.
//
// THE COMPILER OPTIONS ARE READ, NOT RESTATED. `tsconfig.base.json` is the file
// the fourteen package programs inherit, so the probe runs under the resolver the
// wall really uses; `moduleResolution` is asserted below, because a probe that
// silently fell back to a different resolution algorithm would be measuring
// nothing at all.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EDGE_LAYER, parseLaws } from "./registry";

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, "..", "..");
const REPO = join(ROOT, "..", "..");
const WORK = join(ROOT, ".work");
const PROBES = join(ROOT, "test", "gate", "fixtures", "edges");
/** The three probe files, named once so the cleanup below cannot fall behind
 *  the set the tests drive. */
const PROBE_NAMES = ["cross-block-deep", "cross-block-published", "foreign-library"] as const;

/** The PURITY-EDGE pair, driven by the second harness below rather than by the
 *  flat one above: a project boundary is invisible to a single-program compile,
 *  so this pair only means anything under `tsc -b`. */
const WALL_PROBES = ["pure-reaches-impure", "impure-reaches-its-port"] as const;

/** Where a probe is planted: a block package that is NOT the one it reaches
 *  into. A file outside every package would still resolve the same specifiers,
 *  and would prove nothing about a block. */
const HOST = join("src", "blocks", "escalation");

const BASE = JSON.parse(readFileSync(join(ROOT, "tsconfig.base.json"), "utf8")) as {
  compilerOptions: Record<string, unknown>;
};

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: { ...BASE.compilerOptions, noEmit: true },
    include: ["src"],
    // the co-located block tests are residents of the package, not part of it —
    // the same exclusion each package tsconfig makes.
    exclude: ["**/*.test.ts"],
  },
  null,
  2,
);

/** Every workspace package, and where inside the COPY it lives. */
const PACKAGES: Readonly<Record<string, string>> = {
  app: "../../src/app",
  spine: "../../src/spine",
  "block-analysis": "../../src/blocks/analysis",
  "block-artifact": "../../src/blocks/artifact",
  "block-console": "../../src/blocks/console",
  "block-escalation": "../../src/blocks/escalation",
  "block-inbox": "../../src/blocks/inbox",
  "block-triage": "../../src/blocks/triage",
  "block-analysis-adapter": "../../src/blocks/analysis/adapter",
  "block-artifact-adapter": "../../src/blocks/artifact/adapter",
  "block-console-adapter": "../../src/blocks/console/adapter",
  "block-escalation-adapter": "../../src/blocks/escalation/adapter",
  "block-inbox-adapter": "../../src/blocks/inbox/adapter",
  "block-triage-adapter": "../../src/blocks/triage/adapter",
};

function build(probe: string): string {
  const dir = join(WORK, `edge-${probe}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "node_modules", "@adr"), { recursive: true });
  cpSync(join(ROOT, "src"), join(dir, "src"), {
    recursive: true,
    filter: (from) => !from.includes("/.work"),
  });
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  for (const [pkg, target] of Object.entries(PACKAGES)) {
    symlinkSync(target, join(dir, "node_modules", "@adr", pkg), "dir");
  }
  const source = readFileSync(join(PROBES, `${probe}.ts`), "utf8");
  // non-empty, so a probe file emptied or renamed fails HERE rather than
  // compiling clean and reading as an accepted import.
  expect(source, probe).toContain("import");
  writeFileSync(join(dir, HOST, "probe.ts"), source);
  return dir;
}

function typecheck(dir: string): { code: number; output: string } {
  try {
    const output = execFileSync(
      join(ROOT, "node_modules", ".bin", "tsc"),
      ["--noEmit", "-p", dir],
      {
        encoding: "utf8",
        cwd: ROOT,
      },
    );
    return { code: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const shipped = parseLaws(readFileSync(join(REPO, "laws.toml"), "utf8"));

/** ITS OWN SCRATCH DIRECTORIES, removed by the harness that made them. They used
 *  to be swept by test/gate/exhaustiveness.test.ts's `rmSync(WORK)`, which was an
 *  accident twice over: vitest runs test FILES in parallel, so that sweep could
 *  fire WHILE these probes were compiling, and it only ever ran if that file
 *  happened to finish last. That sweep is now scoped to its own fixtures, so this
 *  one is scoped to its own too. */
afterAll(() => {
  for (const probe of PROBE_NAMES) {
    rmSync(join(WORK, `edge-${probe}`), { recursive: true, force: true });
  }
  for (const probe of WALL_PROBES) {
    rmSync(join(WORK, `wall-${probe}`), { recursive: true, force: true });
  }
});

describe("the configuration-time rung, measured rather than reasoned about", () => {
  it("runs under the resolver the wall really uses", () => {
    expect(BASE.compilerOptions.moduleResolution).toBe("bundler");
    expect(BASE.compilerOptions.strict).toBe(true);
  });

  it("REFUSES a sibling block's internals — and RESOLVES its published entry", () => {
    const refused = typecheck(build("cross-block-deep"));
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain("TS2307");
    expect(refused.output).toContain("@adr/block-triage/fold");

    // THE CONTROL, in the same test: without it the assertion above is satisfied
    // by any compiler failure at all.
    const resolved = typecheck(build("cross-block-published"));
    expect(resolved.output).toBe("");
    expect(resolved.code).toBe(0);

    // so the two laws whose crossing half this edge holds may print the rung
    for (const id of ["G10", "G11"]) {
      expect(shipped.registry.laws.find((l) => l.id === id)?.layers, id).toContain(EDGE_LAYER);
    }
  });

  it("ACCEPTS a foreign library inside a block — so that law keeps the lower rung", () => {
    const accepted = typecheck(build("foreign-library"));
    expect(accepted.output).toBe("");
    expect(accepted.code).toBe(0);

    // The counterexample, made permanent. G4 and G2 are the two laws whose
    // violating shape this probe wears; neither may claim the rung while one
    // reference port accepts it.
    for (const id of ["G2", "G4"]) {
      const law = shipped.registry.laws.find((l) => l.id === id);
      expect(law?.layers, id).not.toContain(EDGE_LAYER);
      expect(law?.edges, id).toEqual([]);
    }
  });
});

// ── THE PURITY EDGE, measured the only way it CAN be ──────────────────────
//
// §7.8 says the purity boundary inside a block is drawn by the unit
// split and NOT by a rule reading file names. On this port that claim is about
// two `tsconfig` projects, and a project boundary is invisible to the flat
// program the harness above compiles: every file resolves every other one there,
// which is exactly why `tsc --noEmit -p <dir>` cannot measure this. So this
// harness runs the WALL — `tsc -b --force tsconfig.wall.json` over a copy of the
// tree — which is the same build `npm run typecheck:wall` runs.
//
// THE PAIR, and the control is load-bearing for the same reason it is above:
//   pure-reaches-impure       a pure file names its own block's adapter unit
//                             → REFUSED, TS6307
//   impure-reaches-its-port   the leaf names its own block's port
//                             → RESOLVES, exit 0
// Without the second, the first is satisfied by any compiler failure at all —
// a bad copy, a missing base config, a broken symlink.
//
// MEASURED BEFORE THE SPLIT, so the delta is a number and not a story: with the
// adapter inside the block's one package, the same reach passed `tsc --noEmit`,
// passed `tsc -b`, passed eslint and passed biome. The whole gate was green over
// a pure fold arm calling its block's live client. It is TS6307 now.
//
// `tsc -b` is a BUILD, so the copy gets its own `.tsbuild` under `.work/` and the
// directory is removed in `afterAll` with the probes above. Measured: a TS6307
// failure emits nothing beside the source — the rootDir-violating emission
// scripts/wall.mjs sweeps is a different failure — so this harness leaves no
// dropping for that sweep or for the gate's no-committed-emission walk to find.

/** The wall harness's own copy: `src`, the base options every package extends,
 *  and the solution file the wall builds. The `@adr` farm points at the COPY for
 *  the same reason it does above — without it every package specifier would
 *  resolve back into the real tree and the probe would measure a directory
 *  nobody edited. */
function buildWall(probe: string, host: string): string {
  const dir = join(WORK, `wall-${probe}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "node_modules", "@adr"), { recursive: true });
  cpSync(join(ROOT, "src"), join(dir, "src"), {
    recursive: true,
    filter: (from) => !from.includes("/.work"),
  });
  cpSync(join(ROOT, "tsconfig.base.json"), join(dir, "tsconfig.base.json"));
  cpSync(join(ROOT, "tsconfig.wall.json"), join(dir, "tsconfig.wall.json"));
  for (const [pkg, target] of Object.entries(PACKAGES)) {
    symlinkSync(target, join(dir, "node_modules", "@adr", pkg), "dir");
  }
  const source = readFileSync(join(PROBES, `${probe}.ts`), "utf8");
  expect(source, probe).toContain("import");
  writeFileSync(join(dir, host, "probe.ts"), source);
  return dir;
}

function buildSolution(dir: string): { code: number; output: string } {
  try {
    const output = execFileSync(
      join(ROOT, "node_modules", ".bin", "tsc"),
      ["-b", "--force", "tsconfig.wall.json"],
      { encoding: "utf8", cwd: dir },
    );
    return { code: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const PURE_HOST = join("src", "blocks", "escalation");
const LEAF_HOST = join("src", "blocks", "escalation", "adapter");

describe("the purity boundary is the unit split, measured by the real compiler", () => {
  it("REFUSES a pure file reaching its own block's impure unit — and RESOLVES the leaf reaching its own block's port", () => {
    const refused = buildSolution(buildWall("pure-reaches-impure", PURE_HOST));
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain("TS6307");
    // the message names the FOLDER, which is what makes this the unit split
    // rather than an unrelated compile failure
    expect(refused.output).toContain("adapter/adapter.ts");

    const resolved = buildSolution(buildWall("impure-reaches-its-port", LEAF_HOST));
    expect(resolved.output).toBe("");
    expect(resolved.code).toBe(0);
  });
});
