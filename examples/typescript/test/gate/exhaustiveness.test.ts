// ── G12 / §15.4 — adding a variant BREAKS THE BUILD, and only there ──
//
// MEASURED against the shipped reference: adding
//   | { readonly kind: "Archived"; readonly at: number }
// to TicketStatus left `tsc --noEmit` at exit 0 and 8/8 tests passing, because
// `projection.ts:30-31` discriminated with `t.status.kind === "Open"` instead of
// a closed, never-guarded match. 15.4's central promise — "the compiler hands
// you the edit list" — was false at the one place a reader would check it.
//
// This test performs the promise instead of asserting it: it copies the real
// source tree, applies a shipped patch fixture, runs the real compiler, and
// requires a non-zero exit naming EVERY consumer and nothing outside the block.
//
// TWO FIXTURES RIDE IT:
//
//   extra-ticket-status   a fifth STATE VARIANT   → 3 sites, all in blocks/escalation/
//   novel-effect-kind     a second EFFECT KIND    → 2 sites: the owning block's
//                         handler table, and the GATE's own totality ledger
//
// THE MEASUREMENT PROGRAM IS THE GATE'S OWN PROGRAM, and that is the whole of
// this harness's second revision. It used to compile `include: ["src"]` with
// `exclude: ["**/*.test.ts"]` — strictly narrower than `tsc --noEmit`, whose
// program is `["src", "test", "eslint.config.js"]`. A cost that moved into a test
// file was therefore invisible to the instrument that reported the cost, which is
// the one thing an instrument may never be. The copy below carries `test/` and
// the gate config, and mirrors the real `exclude` list verbatim, so
// `outOfFolder` below is a number about the gate rather than about this file's
// own field of view.
//
// THE PACKAGE FARM IS LOAD-BEARING. Since the workspace wall, `src/app` reaches a
// block through the bare specifier `@adr/block-triage/register`, which node
// resolves through `node_modules`. A copy without its own `@adr` links resolves
// every cross-package import back to the REAL tree — so the patch would be
// invisible to `app/` and `spine/`, and "zero sites outside the folder" would be
// true by construction rather than by measurement. The farm below points every
// `@adr/*` at the COPY, which is what makes the outside-the-folder count a real
// number. Everything else (`valibot`, `ai`, `@types/node`, `typescript-eslint`)
// still resolves upward to the project's own `node_modules`.
//
// Manual proof, one command: add `Archived` to TicketStatus in
// `src/blocks/escalation/slice.ts` and run `npm run typecheck`. Expect three
// errors, in `blocks/escalation/fold.ts` and `blocks/escalation/project.ts`.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, "..", "..");
// THE SCRATCH DIR SITS AT THE PORT ROOT, not under `test/`. It has to: the copy
// now carries `test/`, and `fs.cpSync` refuses — before any filter runs — to copy
// a directory into a subdirectory of itself. Still in-project, so `node_modules`
// resolution keeps working; still named `.work`, so the citation census's
// skip-by-entry-name already covers it; and vitest, eslint and git are each told
// about it, because a persisted copy from an ABANDONED run is a discoverable
// second copy of every test file in the tree.
const WORK = join(ROOT, ".work");

interface Patch {
  readonly expect: {
    readonly owner: string;
    readonly files: readonly string[];
    readonly errors: number;
    readonly perFile: Readonly<Record<string, number>>;
    /** EXACTLY the error files that are NOT under `src/blocks/<owner>/`. An
     *  equality, not a floor: a new out-of-folder consumer is as red as a lost
     *  one, which is the property a bare "and nowhere else" cannot have. */
    readonly outOfFolder: readonly string[];
  };
  readonly edits: readonly {
    readonly file: string;
    readonly find: string;
    readonly replace: string;
  }[];
}

/** The fixture roster, and the claim each one earns. */
const FIXTURES = ["extra-ticket-status", "novel-effect-kind"] as const;

const patchOf = (name: string): Patch =>
  JSON.parse(readFileSync(join(HERE, "fixtures", name, "patch.json"), "utf8")) as Patch;

/** The gate's own program, restated for the copy. `include` and `exclude` are the
 *  root tsconfig's, verbatim: the deliberately-broken fixture trees and this
 *  harness's own scratch copies stay OUT of the program, and everything the gate
 *  compiles stays IN. */
const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2023",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2023"],
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowJs: true,
      resolveJsonModule: true,
      types: ["node"],
      noEmit: true,
    },
    include: ["src", "test", "eslint.config.js"],
    exclude: [
      "node_modules",
      "test/gate/fixtures",
      "test/gate/.work",
      "test/laws/fixtures/citations",
      // the quickstart walk's adopter template: a SECOND application, compiled
      // against its own copy of the tier by test/laws/quickstart.test.ts and
      // never as part of this program.
      "test/laws/fixtures/quickstart",
    ],
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
};

/** Copy the real tree into an in-project scratch dir (so `node_modules`
 *  resolution still works), optionally applying a patch.
 *
 *  `test/gate/.work` is skipped rather than copied: it is where THIS function
 *  writes, so copying it would nest one measurement inside the next. */
function build(name: string, patch: Patch | null): string {
  const dir = join(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "node_modules", "@adr"), { recursive: true });
  // belt and braces: a stale copy from the harness's previous home never rides along.
  const skipWork = (from: string): boolean => !from.includes("/.work");
  cpSync(join(ROOT, "src"), join(dir, "src"), { recursive: true, filter: skipWork });
  cpSync(join(ROOT, "test"), join(dir, "test"), { recursive: true, filter: skipWork });
  cpSync(join(ROOT, "eslint.config.js"), join(dir, "eslint.config.js"));
  // `test/gate/gate.test.ts` imports `../../package.json` under
  // `resolveJsonModule`, so the manifest is part of the gate's program too.
  cpSync(join(ROOT, "package.json"), join(dir, "package.json"));
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  for (const [pkg, target] of Object.entries(PACKAGES)) {
    symlinkSync(target, join(dir, "node_modules", "@adr", pkg), "dir");
  }
  if (patch !== null) {
    for (const edit of patch.edits) {
      const target = join(dir, edit.file);
      const text = readFileSync(target, "utf8");
      expect(text).toContain(edit.find);
      writeFileSync(target, text.replace(edit.find, edit.replace));
    }
  }
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

const errorsIn = (output: string): readonly string[] =>
  output.split("\n").filter((l) => /error TS/.test(l));

/** The COPY-relative path a compiler error names. Everything up to and including
 *  `.work/<fixture>/` is scratch-dir noise; what is left is the path a reader
 *  would edit in the real tree. */
const RELATIVE = /\.work\/[^/]+\/(.*)$/;
const fileOf = (line: string): string => {
  const site = /^(.*?)\(\d+,\d+\)/.exec(line);
  const path = site?.[1] ?? line;
  return RELATIVE.exec(path)?.[1] ?? path;
};

describe("G12 — the compiler produces the edit list §15.4 promises", () => {
  it("ALLOW: the shipped tree compiles clean, with every package resolving to the COPY", () => {
    // Also the proof that the WIDENED program is well-formed rather than merely
    // narrower: `src`, `test` and the gate config compile together to nothing.
    const result = typecheck(build("compliant", null));
    expect(result.output).toBe("");
    expect(result.code).toBe(0);
  });

  it.each(FIXTURES)("BLOCK: `%s` breaks the build at its named sites and nowhere else", (name) => {
    const patch = patchOf(name);
    const result = typecheck(build(name, patch));
    expect(result.code).not.toBe(0);

    const errorLines = errorsIn(result.output);
    // exactly the promised number of sites …
    expect(errorLines).toHaveLength(patch.expect.errors);
    // … each one in a file the fixture named, and nowhere else …
    for (const line of errorLines) {
      expect(
        patch.expect.files.some((f) => line.includes(f)),
        line,
      ).toBe(true);
    }
    // … distributed exactly as promised, file by file. A rule that stops firing
    // at one site and starts firing twice at another satisfies a bare count.
    for (const [file, count] of Object.entries(patch.expect.perFile)) {
      expect(
        errorLines.filter((l) => l.includes(file)),
        file,
      ).toHaveLength(count);
    }
    // THE OUT-OF-FOLDER SET, as an EQUALITY. This is the number the handler
    // split's receipt is written in, so it is asserted as a set rather than as
    // an absence: a second consumer appearing outside the owning block folder is
    // as red as one disappearing.
    const outOfFolder = [
      ...new Set(
        errorLines.map(fileOf).filter((f) => !f.startsWith(`src/blocks/${patch.expect.owner}/`)),
      ),
    ].sort();
    expect(outOfFolder).toEqual([...patch.expect.outOfFolder].sort());
    // ZERO PRODUCTION sites outside the folder — the composition root and the
    // spine never move. Spelled `src/app/` and `src/spine/` rather than `/app/`
    // and `/spine/`, because the program now carries `test/app/` too and the old
    // spelling would have fired on the gate's own ledger.
    expect(errorLines.some((l) => l.includes("src/app/") || l.includes("src/spine/"))).toBe(false);
  });

  it("cleans up after itself", () => {
    // ITS OWN FIXTURE DIRECTORIES, not the whole of `.work`. vitest runs test
    // FILES in parallel, so a wholesale delete here would race any other
    // harness that scratches in the same place.
    for (const name of ["compliant", ...FIXTURES]) {
      rmSync(join(WORK, name), { recursive: true, force: true });
    }
  });
});
