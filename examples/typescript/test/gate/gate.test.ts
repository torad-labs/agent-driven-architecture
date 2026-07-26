// ── F12 — the gate DENIES, and every check has a BLOCK-test AND an ALLOW-test ─
// 15.2's discipline, restated for builders: a wrong rule is fixed and re-tested,
// never disabled. No check ships without its allow-test — that is what keeps a
// check from drifting into a nuisance authors turn off.
//
// The checker under test IS the shipped one. `eslint.config.js` exports `gate`
// (the rules) and default-exports the same rules plus the fixture ignore, so
// `npm run lint` and the tests below run the SAME rule objects over the same
// path globs. There is no second implementation to drift.

import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../eslint.config.js";
import { harness } from "../harness";
import { must } from "../support/must";
import { registryGaps } from "./totality";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const FIXTURES = join(ROOT, "test", "gate", "fixtures");

// `overrideConfigFile: true` means "load no config file" — so what runs below is
// exactly `gate`, the array `eslint.config.js` default-exports to `npm run lint`.
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: gate as ESLint.Options["overrideConfig"],
});

/** Every lint message the given check produced under `dir`. */
async function violations(check: (typeof CHECKS)[number], dir: string): Promise<readonly string[]> {
  const results = await eslint.lintFiles([join(dir, "src")]);
  return results.flatMap((r) =>
    r.messages
      .filter((m) =>
        check.by === "rule" ? m.ruleId === check.rule : m.message.includes(`[${check.id}]`),
      )
      .map((m) => `${r.filePath.slice(ROOT.length + 1)}:${m.line}  ${m.message}`),
  );
}

const LINTED = CHECKS.filter((c) => c.by !== "vitest");

describe.each(LINTED)("$id — $invariant", (check) => {
  it("DENIES its violating fixture", async () => {
    expect(await violations(check, join(FIXTURES, "violating", check.id))).not.toEqual([]);
  });

  it("ALLOWS its compliant fixture — idiomatic code passes untouched", async () => {
    expect(await violations(check, join(FIXTURES, "compliant", check.id))).toEqual([]);
  });
});

// ── C13 — a question about values, so it is a vitest check (§9's own row) ───
// Same checker, two inputs. The ALLOW half runs it over the shipped registry;
// the BLOCK half pulls one verb out and watches it deny.
describe("C13 — registry totality", () => {
  const declared = [
    "setPriority",
    "requestEscalation",
    "confirmEscalation",
    "focusTicket",
    "setPanel",
    "recordFinding",
    "requestSeal",
    "confirmSeal",
    "recallAnalysis",
    "publishAnalysis",
    "noteDrop",
    "noteFault",
  ];

  it("ALLOWS the shipped registry — every declared verb is registered and signs", () => {
    expect(registryGaps(declared, harness().app.registry)).toEqual([]);
  });

  it("DENIES a registry with a verb pulled out of it", () => {
    const thinned = new Map(harness().app.registry);
    thinned.delete("confirmSeal");
    expect(registryGaps(declared, thinned)).toEqual([
      '"confirmSeal" is a declared ToolResult case with no Verb entry',
    ]);
  });

  it("DENIES a verb that is registered but signs nothing", () => {
    const registry = new Map(harness().app.registry);
    const real = must(registry.get("setPriority"));
    registry.set("setPriority", {
      ...real,
      sign: (result) => ({
        ...real.sign(result, { by: "Human", authority: "x" as never }, "z"),
        tool: "somethingElse",
      }),
    });
    expect(registryGaps(declared, registry)).toEqual([
      '"setPriority" is registered but does not sign — 6.8\'s name→Command map has a hole',
    ]);
  });
});

describe("the gate runs against the shipped tree", () => {
  it("the reference implementation passes every check", async () => {
    const results = await eslint.lintFiles([join(ROOT, "src")]);
    const messages = results.flatMap((r) =>
      r.messages.map(
        (m) => `${r.filePath.slice(ROOT.length + 1)}:${m.line}  ${m.ruleId}  ${m.message}`,
      ),
    );
    expect(messages).toEqual([]);
  });

  it("ships fifteen checks — the count is not the point, the denial is", () => {
    expect(CHECKS).toHaveLength(15);
    expect(CHECKS.map((c) => c.id)).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
      "C6",
      "C7",
      "C8",
      "C9",
      "C10",
      "C11",
      "C12",
      "C13",
      "C14",
      "C15",
    ]);
  });

  it("is wired into the normal build — a check invoked separately is not a gate", async () => {
    const pkg = (await import("../../package.json", { with: { type: "json" } })).default;
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.scripts.test).toContain("npm run lint");
  });
});
