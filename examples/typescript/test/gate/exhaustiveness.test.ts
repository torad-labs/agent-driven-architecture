// ── G12 / §15.4 — adding a variant BREAKS THE BUILD at every consumer ──────
//
// MEASURED against the shipped reference: adding
//   | { readonly kind: "Archived"; readonly at: number }
// to TicketStatus left `tsc --noEmit` at exit 0 and 8/8 tests passing, because
// `projection.ts:30-31` discriminated with `t.status.kind === "Open"` instead of
// a closed, never-guarded match. 15.4's central promise — "the compiler hands
// you the edit list" — was false at the one place a reader would check it.
//
// This test performs the promise instead of asserting it: it copies the real
// source tree, applies the shipped patch fixture, runs the real compiler, and
// requires a non-zero exit naming EVERY consumer and nothing outside the block.
//
// Manual proof, one command: add `Archived` to TicketStatus in
// `src/blocks/escalation/slice.ts` and run `npm run typecheck`. Expect three
// errors, in `blocks/escalation/fold.ts` and `blocks/escalation/project.ts`.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, "..", "..");
const WORK = join(HERE, ".work");

interface Patch {
  readonly expect: { readonly files: readonly string[]; readonly errors: number };
  readonly edits: readonly {
    readonly file: string;
    readonly find: string;
    readonly replace: string;
  }[];
}

const patch: Patch = JSON.parse(
  readFileSync(join(HERE, "fixtures", "extra-ticket-status", "patch.json"), "utf8"),
) as Patch;

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
      types: ["node"],
      noEmit: true,
    },
    include: ["src"],
  },
  null,
  2,
);

/** Copy the real tree into an in-project scratch dir (so `node_modules`
 *  resolution still works), optionally applying the patch. */
function build(name: string, apply: boolean): string {
  const dir = join(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, "src"), join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  if (apply) {
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

describe("G12 — the compiler produces the edit list §15.4 promises", () => {
  it("ALLOW: the shipped tree compiles clean", () => {
    const result = typecheck(build("compliant", false));
    expect(result.output).toBe("");
    expect(result.code).toBe(0);
  });

  it("BLOCK: a fifth TicketStatus variant breaks the build at every consumer", () => {
    const result = typecheck(build("violating", true));
    expect(result.code).not.toBe(0);

    const errorLines = result.output.split("\n").filter((l) => /error TS/.test(l));
    // exactly the promised number of sites …
    expect(errorLines).toHaveLength(patch.expect.errors);
    // … each one inside the escalation block, and nowhere else
    for (const line of errorLines) {
      expect(patch.expect.files.some((f) => line.includes(f))).toBe(true);
    }
    // the fold arm's status match, the view row match and the context line match
    expect(errorLines.filter((l) => l.includes("blocks/escalation/fold.ts"))).toHaveLength(1);
    expect(errorLines.filter((l) => l.includes("blocks/escalation/project.ts"))).toHaveLength(2);
    // K = 3, and ZERO sites outside blocks/escalation/
    expect(errorLines.some((l) => l.includes("/app/") || l.includes("/spine/"))).toBe(false);

    rmSync(WORK, { recursive: true, force: true });
  });
});
