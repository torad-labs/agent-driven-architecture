// ── 15.2 — the gate DENIES, and every check has a BLOCK- and an ALLOW-test ────
// 15.2's discipline, restated for builders: a wrong rule is fixed and re-tested,
// never disabled. No check ships without its allow-test — that is what keeps a
// check from drifting into a nuisance authors turn off.
//
// The checker under test IS the shipped one. `eslint.config.js` exports `gate`
// (the rules) and default-exports the same rules plus the fixture ignore, so
// `npm run lint` and the tests below run the SAME rule objects over the same
// path globs. There is no second implementation to drift.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { CHECKS, gate } from "../../eslint.config.js";
import { Signature } from "../../src/spine/pure/actor";
import { harness } from "../harness";
import { must } from "../support/must";
import { registryGaps } from "./totality";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
/** the repository root — the sweep in scripts/wall.mjs walks from here, so the
 *  no-committed-emission assertion has to walk the same tree it does. */
const REPO_ROOT = join(ROOT, "..", "..");
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

/** `{ relative-path: message count }` for one check over one fixture tree. A
 *  file that produced nothing is present with 0 rather than absent, so a vector
 *  that stops being denied is a diff and not a shorter object. */
async function perFile(
  check: (typeof CHECKS)[number],
  dir: string,
): Promise<Record<string, number>> {
  const src = join(dir, "src");
  const results = await eslint.lintFiles([src]);
  const counts: Record<string, number> = {};
  for (const r of results) {
    counts[relative(src, r.filePath)] = r.messages.filter((m) =>
      check.by === "rule" ? m.ruleId === check.rule : m.message.includes(`[${check.id}]`),
    ).length;
  }
  return counts;
}

/**
 * WHAT EACH CHECK MUST DENY, PER FILE AND PER COUNT — the block-test's real
 * assertion.
 *
 * The shipped version asserted `not.toEqual([])` over the whole fixture
 * DIRECTORY, and a review proved what that buys: a check spanning several rule
 * groups stays green when the group doing the real work is deleted, because a
 * sibling group still fires somewhere in the tree. Measured, ten of twenty-three
 * rule groups could be deleted outright with the full gate green — including
 * `C7_LITERAL` (a fold arm could then mint a signed transport) and `C8_SYNTAX`
 * (a pure file could declare `async` and `await`).
 *
 * This is the C4 block's own idiom below, generalised: that block already pins a
 * per-file map for exactly this reason, and paid for the lesson once. Every
 * count here was MEASURED off the fixture trees, never chosen; a number that
 * moves is a rule that changed reach, which is a diff a reviewer must see.
 */
const DENIED: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  C1: { "blocks/triage/adapter/adapter.ts": 1, "spine/pure/thing.ts": 1 },
  C2: { "blocks/triage/fold.ts": 2 },
  C3: { "blocks/triage/tools.ts": 2 },
  C4: {
    "blocks/triage/contract.ts": 1,
    "blocks/triage/fold.ts": 1,
    "blocks/triage/project.ts": 1,
    "blocks/triage/slice.ts": 4,
    "blocks/triage/tools.ts": 2,
    "spine/boundary/alias.ts": 2,
    "spine/boundary/launder.ts": 1,
    "spine/pure/actor.ts": 3,
    "spine/pure/staged.ts": 1,
    "spine/pure/verb.ts": 1,
  },
  C5: { "blocks/triage/fold.ts": 2 },
  C6: { "blocks/escalation/fold.ts": 1 },
  // +2 fold.ts (2 -> 4): the seal's LAUNDER vector, `export { seal } from …`,
  // which C7_LAUNDER and C7_MINT each deny once — the re-export is a `from`
  // clause the import rule can still read.
  // +1 project.ts (3 -> 4): the seal's MINT vector, `import { seal }` in a block.
  // NEW spine/pure/step-record.ts (7): the seal's FORM vectors, authored inside
  // the bucket the mint is EXEMPTED for, which is the only place a value
  // binding of it can exist. Every import in that file is RENAMED, so a
  // name-keyed rule scores zero there by construction — the seven are the const
  // rebinding, the specifier, the default, the subclass declaration, the class
  // EXPRESSION (which counts twice: it is both a non-literal init and a
  // superclass), and the reassignable `export let`. Measured off the tree, not
  // derived: a number that moves is a clause that changed reach.
  C7: {
    "blocks/triage/fold.ts": 4,
    "blocks/triage/project.ts": 4,
    "spine/pure/step-record.ts": 7,
  },
  C8: { "blocks/triage/tools.ts": 5 },
  C9: { "blocks/escalation/project.ts": 1 },
  C10: { "app/wire.ts": 1 },
  C11: { "spine/ports/clock.ts": 2 },
  C12: { "blocks/console/fold.ts": 1 },
  C14: { "spine/agent/loop.ts": 3 },
  C15: { "spine/pure/thing.ts": 3 },
  C16: { "spine/replay/replay.ts": 3 },
};

describe.each(LINTED)("$id — $invariant", (check) => {
  it("DENIES its violating fixture — PER FILE, so no clause can go silent", async () => {
    expect(await perFile(check, join(FIXTURES, "violating", check.id))).toEqual(
      must(DENIED[check.id]),
    );
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
//
// This is the VERB half. C13's handler half is the same shape one seam over and
// lives with its own ledger in test/app/totality.test.ts.
describe("C13 — the verb-registry half", () => {
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

// ── THE THREE DENIALS THE WALL MADE NECESSARY, ASSERTED PER MESSAGE ────────
// C2 and C15 each grew a pattern when the tree gained package specifiers, and
// C1's `EXTERNAL` cell had to be narrowed so an adapter's licence to hold a
// client library did not become a licence to hold the whole spine. All three
// ride fixtures that ALREADY produce a message for their own tag, so the
// tag-keyed pair above would stay green over a pattern that matched nothing —
// the C7-derivation rot, one more time. These key on the specific message.
describe("the package-specifier route is denied, per rule", () => {
  const messages = async (kind: string, id: string): Promise<readonly string[]> => {
    const results = await eslint.lintFiles([join(FIXTURES, kind, id, "src")]);
    return results.flatMap((r) => r.messages.map((m) => `${basename(r.filePath)}  ${m.message}`));
  };
  const SIBLING_PKG = "may not import a sibling block by package name either";
  const SPINE_NAMES_BLOCK = "a package specifier is still naming one";
  const ADAPTER_TIER = "an adapter leaf may import its own block";

  it("C2 DENIES a sibling reached by its package name — the one route tsc resolves", async () => {
    // The SPECIFIER is asserted, not just the tag: this rule is the only thing
    // standing between a block and `@adr/block-escalation/register`, and eslint
    // names the pattern's subject in the message it prefixes ours with.
    const hits = (await messages("violating", "C2")).filter((m) => m.includes(SIBLING_PKG));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("fold.ts");
    expect(hits[0]).toContain("'@adr/block-escalation/register'");
  });

  it("C15 DENIES a block named by package name from inside the spine tier", async () => {
    const hits = (await messages("violating", "C15")).filter((m) => m.includes(SPINE_NAMES_BLOCK));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("thing.ts");
    expect(hits[0]).toContain("'@adr/block-triage/register'");
  });

  it("C1 DENIES an adapter naming a spine tier that is not `pure`", async () => {
    // The regression the wall would otherwise have introduced: `EXTERNAL` is
    // "any client library", and `@adr/spine/...` is a bare specifier like any
    // other. The fixture is an adapter importing `spine/boundary`.
    const hits = (await messages("violating", "C1")).filter((m) => m.includes(ADAPTER_TIER));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("adapter.ts");
  });

  it("and NONE of the three fires on compliant code — fixtures OR the live adapters", async () => {
    for (const id of ["C1", "C2", "C15"]) {
      const said = await messages("compliant", id);
      for (const needle of [SIBLING_PKG, SPINE_NAMES_BLOCK, ADAPTER_TIER]) {
        expect(
          said.filter((m) => m.includes(needle)),
          `${id}  ${needle}`,
        ).toEqual([]);
      }
    }
    // The narrowed cell's ALLOW half is the LIVE tree rather than a synthetic
    // fixture, and it is the stronger witness: the three shipped adapter LEAVES
    // import `@adr/spine/pure/*` and their own block's port, so a lookahead that
    // over-denied would fire here on real code. The three IO-less blocks ship a
    // declared-EMPTY leaf, which is why this glob finds three files under six
    // `adapter/` folders and the roster below names exactly those three.
    const adapters = await eslint.lintFiles([
      join(ROOT, "src", "blocks", "*", "adapter", "adapter.ts"),
    ]);
    expect(adapters.map((r) => basename(dirname(dirname(r.filePath)))).sort()).toEqual([
      "analysis",
      "artifact",
      "escalation",
    ]);
    expect(
      adapters
        .flatMap((r) => r.messages.map((m) => m.message))
        .filter((m) => m.includes(ADAPTER_TIER)),
    ).toEqual([]);
  });
});

// ── THE WORKSPACE WALL, AND WHETHER IT COVERS EVERYTHING ───────────────────
// The wall's claim is that a cross-block reach is a RESOLUTION error before it
// is a lint message. That claim is exactly as total as the set of projects the
// wall actually builds — and that set is written down TWICE, as `workspaces` in
// package.json and as `references` in tsconfig.wall.json. Two hand-kept lists
// drift: a seventh block added with a package.json and no tsconfig, or with a
// tsconfig nothing references, is a package with no wall, and every other check
// in this file stays green over it.
//
// So the roster is DERIVED from the workspaces globs against the tree, and both
// hand-written sides are required to agree with it. §15.2's bar, turned on the
// wall itself: the enforcement mechanism gets a denying check like everything
// else it enforces.
describe("the workspace wall covers every package", () => {
  interface Manifest {
    readonly private?: boolean;
    readonly version?: string;
    readonly publishConfig?: unknown;
    readonly workspaces?: readonly string[];
    readonly scripts?: Record<string, string>;
    readonly exports?: Record<string, string>;
    readonly "//sunset"?: string;
  }
  const manifest = (dir: string): Manifest =>
    JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8")) as Manifest;
  const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Manifest;
  const wall = JSON.parse(readFileSync(join(ROOT, "tsconfig.wall.json"), "utf8")) as {
    readonly references: readonly { readonly path: string }[];
  };

  /** the workspaces globs EXPANDED against the tree — never a second hand-list.
   *  The star is no longer always last: the glob naming every block's SECOND
   *  build unit carries it in the middle, so the expansion splits on the star
   *  rather than on a trailing one. NOTHING IS FILTERED OUT afterwards — a block
   *  that ships no `adapter/` still yields the path, and the manifest read below
   *  then throws, which is the fail-closed direction: a missing leaf is red, not
   *  invisible. */
  const declared = must(root.workspaces)
    .flatMap((glob) => {
      const star = glob.indexOf("*");
      if (star < 0) return [glob];
      const head = glob.slice(0, star - 1);
      const tail = glob.slice(star + 1);
      return readdirSync(join(ROOT, head), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `${head}/${e.name}${tail}`);
    })
    .sort();
  /** the PURE unit of each block — the package that publishes `./register` */
  const blocks = declared.filter((d) => /^src\/blocks\/[^/]+$/.test(d));
  /** its IMPURE half, one per block and never optional */
  const leaves = declared.filter((d) => /^src\/blocks\/[^/]+\/adapter$/.test(d));

  it("is the fourteen packages the tree holds — the spine, a PAIR per block, the root", () => {
    // §4.6's pair, taken literally: a block is one folder holding TWO
    // build units, and the pair is unconditional. Three of the six blocks own no
    // live IO today and still get a leaf, because a builder may not narrow
    // fourteen to eleven — the same arithmetic the Kotlin port's settings script
    // records for its own fourteen modules.
    expect(declared).toEqual([
      "src/app",
      "src/blocks/analysis",
      "src/blocks/analysis/adapter",
      "src/blocks/artifact",
      "src/blocks/artifact/adapter",
      "src/blocks/console",
      "src/blocks/console/adapter",
      "src/blocks/escalation",
      "src/blocks/escalation/adapter",
      "src/blocks/inbox",
      "src/blocks/inbox/adapter",
      "src/blocks/triage",
      "src/blocks/triage/adapter",
      "src/spine",
    ]);
    // and the pair is DERIVED, so a leaf deleted is a red diff rather than a
    // shorter list nobody reads
    expect(leaves).toEqual(blocks.map((b) => `${b}/adapter`));
  });

  it("BUILDS every one of them — a package no reference names has no wall", () => {
    expect(wall.references.map((r) => r.path).sort()).toEqual(declared);
  });

  it("walls each one the same way: composite, rooted at its own folder", () => {
    // `composite` is what defaults rootDir to the package folder, and rootDir is
    // what turns a reach into a sibling into a resolution error. A package whose
    // tsconfig lost either one would still build clean inside the solution.
    for (const dir of declared) {
      const cfg = JSON.parse(readFileSync(join(ROOT, dir, "tsconfig.json"), "utf8")) as {
        readonly compilerOptions?: { readonly composite?: boolean; readonly rootDir?: string };
      };
      expect(cfg.compilerOptions?.composite, dir).toBe(true);
      expect(cfg.compilerOptions?.rootDir, dir).toBe(".");
    }
  });

  it("REFERENCES ARE THE WALL — a block may see the spine and nothing else", () => {
    // `rootDir` denies a sibling reach only BECAUSE the sibling is unreferenced.
    // An adversarial advocate pushed `{ path: "../artifact" }` into triage's
    // references and the cross-block import RESOLVED — with the whole gate
    // green, because composite/rootDir were both still intact. The reference
    // list was the one part of the wall carrying no instrument, and it is the
    // part C1/C2's sunset (`spine-2`) hands the whole job to.
    const references = (dir: string): readonly string[] | undefined =>
      (
        JSON.parse(readFileSync(join(ROOT, dir, "tsconfig.json"), "utf8")) as {
          readonly references?: readonly { readonly path: string }[];
        }
      ).references?.map((r) => r.path);
    for (const dir of blocks) expect(references(dir), dir).toEqual(["../../spine"]);
    // THE PURITY EDGE, as a reference list. A block's pure unit may see the spine
    // and NOT its own adapter leaf; the leaf may see the spine and its own block.
    // That asymmetry is the whole of §7.8's mechanism on this port — the
    // pure tier has no route to the impure one, so there is no I/O for it to
    // reach — and it is measured with the real compiler in
    // test/laws/edges.test.ts. Here it is the SHAPE, so a reference quietly added
    // to a pure unit is red before any probe has to run.
    for (const dir of leaves) {
      expect(references(dir), dir).toEqual(["../../../spine", ".."]);
    }
  });

  it("NO COMMITTED EMISSION — the wall's sweep keys on siblinghood, so the tree must have none", () => {
    // scripts/wall.mjs identifies an inherited dropping as a `.js`/`.d.ts` with
    // a same-base-name source beside it. That rule is only safe while the tree
    // commits no such pair; this is the assertion that keeps it true, so a
    // hand-written `foo.d.ts` beside `foo.ts` is a red test rather than a file
    // the wall silently eats.
    const emitted: string[] = [];
    const walkTree = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (
          // `.work` JOINS THE SKIP SET — review finding, and it fixes a real
          // intermittent. `test/laws/quickstart.test.ts` builds and then removes
          // `.work/quickstart-walk` in its `afterAll`; vitest runs suites
          // concurrently, so this walker could descend into that tree in the
          // instant between `readdirSync` and the removal and die on ENOENT.
          // Observed once as 501/502 with an immediate rerun at 502/502 — the
          // signature of a race, not a failure.
          //
          // `.work` is generated output, so it was never in this sweep's remit:
          // the sibling censuses (`test/laws/roster-count`,
          // `test/laws/dependency-rule`) already skip it for exactly that reason
          // and this walker was the odd one out. Skipping is therefore the
          // consistent fix rather than a tolerate-ENOENT workaround, which would
          // paper over a genuinely missing tree elsewhere.
          ["node_modules", ".tsbuild", ".git", "build", ".gradle", ".claude", ".work"].includes(
            entry.name,
          )
        ) {
          continue;
        }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walkTree(full);
          continue;
        }
        for (const ext of [".d.ts.map", ".d.ts", ".js.map", ".js"]) {
          if (!full.endsWith(ext)) continue;
          const base = full.slice(0, -ext.length);
          if (existsSync(`${base}.ts`) || (ext.startsWith(".d.ts") && existsSync(`${base}.js`))) {
            emitted.push(full.slice(REPO_ROOT.length + 1));
          }
          break;
        }
      }
    };
    walkTree(REPO_ROOT);
    expect(emitted).toEqual([]);
  });

  it("publishes NONE of them — the spine is a vendored template, not a package", () => {
    // The wall and the template-forever decision have to coexist: the packages
    // exist for the wall and no registry ever sees one. `private` is the switch
    // npm honours; `publishConfig` is the field that would quietly undo it.
    for (const dir of declared) {
      expect(manifest(dir).private, dir).toBe(true);
      // and no version to rot: every manifest's own `//private` note claims
      // this, and nothing checked it until an advocate pushed a version string
      // into a block manifest and watched the whole suite stay green.
      expect(manifest(dir).version, dir).toBeUndefined();
      expect(manifest(dir).publishConfig, dir).toBeUndefined();
    }
    expect(root.private).toBe(true);
    expect(root.publishConfig).toBeUndefined();
  });

  it("publishes only the registration, and names the sunset release beside it", () => {
    // The ratified decision, taken literally: "`exports` limited to the
    // registration" — one published subpath per block and no second. An unlisted
    // subpath is TS2307, so the KEY SET is the public surface — a `.` entry would
    // re-open the bare-root route and an `./adapter` entry would widen the one
    // route the wall cannot close from one bare specifier to two. Both are
    // excluded by asserting the whole set rather than a membership.
    for (const dir of blocks) {
      expect(Object.keys(must(manifest(dir).exports)).sort(), dir).toEqual(["./register"]);
    }
    // THE LEAF PUBLISHES NOTHING, and the empty map is the mechanism rather than
    // a formality. MEASURED: a manifest with NO `exports` field at all does not
    // deny a subpath — it falls back to directory resolution, and
    // `@adr/block-escalation-adapter/adapter` then resolved clean from inside a
    // sibling block, which would have added six new open cross-block routes in
    // the same landing that exists to close one. `{}` denies every subpath
    // (TS2307), which keeps the route the wall cannot close at ONE published
    // specifier per block. The composition root still reaches the leaf, because
    // it does so RELATIVELY through a referenced project and an exports map is
    // not on that path.
    for (const dir of [...leaves, "src/app"]) {
      expect(manifest(dir).exports, dir).toEqual({});
    }
    // The `//sunset` note is one sentence copied into six manifests, and six
    // copies of a claim with no checked source is six chances to drift. The
    // decision asks for a dated marker naming the release that deletes the
    // hand-rolled checks; this is what keeps the six copies of it agreeing.
    const notes = blocks.map((dir) => must(manifest(dir)["//sunset"]));
    expect(new Set(notes).size, notes.join("\n")).toBe(1);
    for (const note of notes) {
      expect(note).toContain("spine-2");
      expect(note).toContain("C1, C2 and C15");
    }
  });

  it("runs the wall from the NORMAL build — a check invoked separately is not a gate", () => {
    // A SUBSTANCE pin, not a string pin: the wall is invoked through a script so
    // a red run cannot leave droppings behind (see scripts/wall.mjs), and what
    // has to stay true is that the script still builds the solution file with
    // --force, and that the normal build still reaches it.
    expect(must(root.scripts)["typecheck:wall"]).toBe("node scripts/wall.mjs");
    const wallScript = readFileSync(join(ROOT, "scripts", "wall.mjs"), "utf8");
    for (const token of ["tsc", "--force", "tsconfig.wall.json"]) {
      expect(wallScript, token).toContain(token);
    }
    expect(must(root.scripts).typecheck).toContain("npm run typecheck:wall");
    expect(must(root.scripts).test).toContain("npm run typecheck");
  });
});

// ── C7's FORM half — the computed key, asserted on its own pair ────────────
// The tag-keyed pair above goes green over a rule that matched NOTHING here:
// `violating/C7` already emits `[C7]` from the enumerated-spelling rule, so the
// widening would ship vacuous and unwatched — the C7-derivation rot in a new
// costume. These assert the FORM rule's own message, per file.
describe("C7 — a computed key is denied as a FORM, in every bucket", () => {
  const COMPUTED = "a computed key spells a field under a name";

  const byFile = async (kind: string): Promise<Record<string, number>> => {
    const results = await eslint.lintFiles([join(FIXTURES, kind, "C7", "src")]);
    const counts: Record<string, number> = {};
    for (const r of results) {
      const n = r.messages.filter((m) => m.message.includes(COMPUTED)).length;
      if (n > 0) counts[basename(r.filePath)] = n;
    }
    return counts;
  };

  it("DENIES the computed spelling the enumerated key rule is blind to", async () => {
    expect(await byFile("violating")).toEqual({ "project.ts": 1 });
  });

  it("ALLOWS every literal key — which is how the whole live tree is written", async () => {
    expect(await byFile("compliant")).toEqual({});
  });

  it("rides EVERY bucket, because it is inside `bucket()` and not in one list", async () => {
    // The measurement behind "costs nothing": the shipped tree writes zero
    // computed object keys, so hoisting the denial into the helper is free.
    const results = await eslint.lintFiles([join(ROOT, "src")]);
    expect(results.flatMap((r) => r.messages.filter((m) => m.message.includes(COMPUTED)))).toEqual(
      [],
    );
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

  it("ships seventeen checks — the count is not the point, the denial is", () => {
    // 15 -> 17: C16 (only the admission rule opens the fold's attributed output)
    // and C17 (an Irreversible-class effect is constructed only at its own
    // pinned site) are the static half of docs/DECISIONS.md:85-86. They move this
    // pin, the Kotlin roster, laws.toml's G6 rows and 15.3's cell together, and
    // each of those is a diff a reviewer sees rather than a number that drifted.
    expect(CHECKS).toHaveLength(17);
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
      "C16",
      "C17",
    ]);
  });

  it("is wired into the normal build — a check invoked separately is not a gate", async () => {
    const pkg = (await import("../../package.json", { with: { type: "json" } })).default;
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.scripts.test).toContain("npm run lint");
  });

  // This port's own arithmetic, PINNED — the same move as the seventeen-check pin
  // above. A counted claim that nothing measures is how "35 files" ships while
  // the tree holds 36, so the count lives HERE, where a spine file added or
  // removed is a diff. This port's README quotes the number; the README text is
  // not itself measured, so a README that disagrees with this pin is a review
  // catch, not a build catch. (The Kotlin port pins its own roster of 38 — one
  // extra ports file here, three pure files there; same components, spelled per
  // language.)
  // 36 -> 37: `pure/version.ts`, the spine version marker. It is a SOURCE file on
  // purpose — a marker in a manifest or a data file would be invisible to this
  // roster and to the Kotlin one, which is exactly the silent-addition class
  // these pins exist to stop. The Kotlin port moves its own 37 -> 38 in the same
  // landing, in its own home, so the two rosters cannot drift apart. The prose
  // that quotes these two numbers is no longer unmeasured either: the file-count
  // band in test/laws/roster-count.test.ts reads every shipped .md/.html for a
  // spine-count claim and derives the truth from the filesystem.
  it("the spine roster is pinned: exactly these 37 files", () => {
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
      "pure/version.ts",
      "pure/view.ts",
      "replay/replay.ts",
      "surface/controller.ts",
    ]);
  });
});
