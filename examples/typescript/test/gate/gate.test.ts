// ── F12 — the gate DENIES, and every check has a BLOCK-test AND an ALLOW-test ─
// 15.2's discipline, restated for builders: a wrong rule is fixed and re-tested,
// never disabled. No check ships without its allow-test — that is what keeps a
// check from drifting into a nuisance authors turn off.
//
// The checker under test IS the shipped one. `eslint.config.js` exports `gate`
// (the rules) and default-exports the same rules plus the fixture ignore, so
// `npm run lint` and the tests below run the SAME rule objects over the same
// path globs. There is no second implementation to drift.

import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../eslint.config.js";
import { Signature } from "../../src/spine/pure/actor";
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

// ── C4's MINT/LAUNDER/SEAL denials, asserted PER FILE ──────────────────────
// C4 now spans five rule groups — an import-name denial on ToolResult
// declarations, two declaration-shape selectors, and the three below — and
// three of its violating files already emit a `[C4]` message. So the tag-keyed
// pair above would go green over a mint rule that matched NOTHING: the
// C7-derivation rot in a new costume.
//
// Message-keyed counts are not enough either, and that is a lesson this file
// paid for: the shipped version asserted `toHaveLength(1)` on a whole-tree
// message count, which a rule that fired on the WRONG file satisfies exactly as
// well as one that fired on the right one. These assert the per-FILE map, so a
// vector that stops being denied and a vector that starts being denied twice
// are both a visible diff.
//
// The invariant, and the honest bound on it: `Signature` is a CLASS, so BINDING
// it as a value is the whole static forge surface upstream of the boundary.
// These rules are total over static ESM value bindings of that NAME. They do
// not — and no lint rule can — deny an explicit assertion, an `any`, or
// `new (sig.constructor as …)()`. Those are closed at runtime instead; see
// test/spine/stamp-residue.test.ts.
describe("C4 — the stamp has ONE production site", () => {
  const MINT = "may name `Signature` as a value";
  const LAUNDER = "is never re-exported as a value";
  const STAR = "republishes every binding";
  const SEAL = "publishes no value binding at all";
  const ALIAS = "binding `Signature` to a second name";
  const DEFAULTPUB = "republishes the constructor under the one name";
  const SUBCLASS = "the subclass IS a production site";

  /** `{ basename: count }` for every message containing `needle`. A file with
   *  zero matches is ABSENT, so an empty object is "nothing fired anywhere". */
  const byFile = async (kind: string, needle: string): Promise<Record<string, number>> => {
    const results = await eslint.lintFiles([join(FIXTURES, kind, "C4", "src")]);
    const counts: Record<string, number> = {};
    for (const r of results) {
      const n = r.messages.filter((m) => m.message.includes(needle)).length;
      if (n > 0) counts[basename(r.filePath)] = n;
    }
    return counts;
  };

  it("DENIES every static ESM value binding of the constructor, file by file", async () => {
    // fold.ts     `import { Signature }`            — the named value import
    // project.ts  `import * as actor`               — the namespace route
    // slice.ts    `export { Signature as Stamp } from` + `export * from`  (2)
    // tools.ts    the same re-export at a `.js` specifier — the spelling that
    //             defeated the path-keyed selectors this rule replaced
    expect(await byFile("violating", MINT)).toEqual({
      "fold.ts": 1,
      "project.ts": 1,
      "slice.ts": 2,
      "tools.ts": 1,
    });
  });

  it("ALLOWS every type-only form the tree already uses", async () => {
    // `import type` in a fold arm, a named type import, `export type { … } from`
    // with and without the `.js` extension — the idiom every block's
    // register.ts ships. A rule that denied these would deny the whole tree.
    expect(await byFile("compliant", MINT)).toEqual({});
  });

  it("DENIES re-export laundering in EVERY bucket, boundary included", async () => {
    // LAUNDER and STAR ride every bucket unconditionally; SEAL rides ONLY the
    // minting bucket, and launder.ts is the proof that the folder exemption
    // does not hand out a rebinding two-hop with it.
    expect(await byFile("violating", LAUNDER)).toEqual({ "slice.ts": 1, "tools.ts": 1 });
    expect(await byFile("violating", STAR)).toEqual({ "slice.ts": 1 });
    expect(await byFile("violating", SEAL)).toEqual({ "launder.ts": 1, "alias.ts": 2 });
  });

  it("DENIES the DECLARATION spellings — alias, default, subclass — everywhere", async () => {
    // actor.ts is the declaring file: no import, so C4_MINT never fires there
    // and each escape must be denied by FORM. alias.ts holds the constructor
    // under a RENAMED import (`__S`), which a name-keyed selector cannot
    // follow by construction — it draws zero here, and the widened SEAL
    // (asserted above, count 2) is the layer that owns that spelling.
    expect(await byFile("violating", ALIAS)).toEqual({ "actor.ts": 1 });
    expect(await byFile("violating", DEFAULTPUB)).toEqual({ "actor.ts": 1 });
    expect(await byFile("violating", SUBCLASS)).toEqual({ "actor.ts": 1 });
  });

  it("ALLOWS the type re-export idiom — and the boundary's own mint", async () => {
    expect(await byFile("compliant", LAUNDER)).toEqual({});
    expect(await byFile("compliant", STAR)).toEqual({});
    expect(await byFile("compliant", SEAL)).toEqual({});
    expect(await byFile("compliant", ALIAS)).toEqual({});
    expect(await byFile("compliant", DEFAULTPUB)).toEqual({});
    expect(await byFile("compliant", SUBCLASS)).toEqual({});
  });

  it("EXEMPTS spine/boundary — the one bucket that mints it", async () => {
    // The exemption is a `mintsStamp` flag on ONE bucket, and a flag nobody
    // watches is a flag that can spread. `boundary.ts` holds the tree's only
    // value import of `Signature`; if C4_MINT ever reached it, the gate would
    // deny the mint itself.
    const results = await eslint.lintFiles([join(ROOT, "src", "spine", "boundary")]);
    const messages = results.flatMap((r) => r.messages.map((m) => m.message));
    expect(messages.filter((m) => m.includes(MINT))).toEqual([]);
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
        ...real.sign(result, new Signature("Human", "x" as never), "z"),
        tool: "somethingElse",
      }),
    });
    expect(registryGaps(declared, registry)).toEqual([
      '"setPriority" is registered but does not sign — 6.8\'s name→Command map has a hole',
    ]);
  });
});

// ── the gate cannot be silenced from inside a file (15.2, made structural) ──
// `linterOptions.noInlineConfig` renders every inline directive inert. The
// fixture below carries a file-wide `/* eslint-disable */` ABOVE a C3 violation:
// if the directive ever works again, this test is what goes red.
describe("inline suppression is inert", () => {
  it("DENIES a violation even under a file-wide eslint-disable", async () => {
    const results = await eslint.lintFiles([join(FIXTURES, "suppression", "src")]);
    const messages = results.flatMap((r) => r.messages.map((m) => m.message));
    expect(messages.filter((m) => m.includes("[C3]"))).not.toEqual([]);
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

  // §1.3's arithmetic, PINNED — the same move as the fifteen-check pin above.
  // The book counts the spine tier's files, and a counted claim that nothing
  // measures is how "35 files" ships while the tree holds 36. A spine file
  // added or removed is a diff HERE too, so the prose's number can never drift
  // from the tree again. (The Kotlin port pins its own roster of 37 — one
  // extra ports file here, three pure files there; same components, spelled
  // per language.)
  it("the spine roster is pinned: exactly these 36 files", () => {
    const files = readdirSync(join(ROOT, "src", "spine"), { recursive: true })
      .map((f) => String(f).replaceAll("\\", "/"))
      .filter((f) => f.endsWith(".ts"))
      .sort();
    expect(files).toEqual([
      "agent/loop.ts",
      "boundary/action.ts",
      "boundary/boundary.ts",
      "boundary/gate.ts",
      "boundary/in-memory.ts",
      "concurrency/consumer.ts",
      "concurrency/in-memory.ts",
      "ports/authorization.ts",
      "ports/bus.ts",
      "ports/clock.ts",
      "ports/event-source.ts",
      "ports/id-source.ts",
      "ports/mailbox.ts",
      "ports/model-provider.ts",
      "ports/relay.ts",
      "ports/scheduler.ts",
      "ports/sink.ts",
      "pure/actor.ts",
      "pure/command.ts",
      "pure/context.ts",
      "pure/effect.ts",
      "pure/emit.ts",
      "pure/ids.ts",
      "pure/keyed-effect.ts",
      "pure/mailbox.ts",
      "pure/notice.ts",
      "pure/run-status.ts",
      "pure/spine-slice.ts",
      "pure/staged.ts",
      "pure/step-record.ts",
      "pure/tool-result.ts",
      "pure/turn.ts",
      "pure/verb.ts",
      "pure/view.ts",
      "replay/replay.ts",
      "surface/controller.ts",
    ]);
  });
});
