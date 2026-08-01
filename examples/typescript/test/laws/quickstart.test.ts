// ── THE QUICKSTART CHECK'S LIVE HALF, ITS PAIR, AND THE WALK ──────────────
//
// Three layers, and they are not interchangeable — each catches something the
// one above it cannot:
//
//   1. THE LIVE HALF. Every path the two step lists name is resolved on disk,
//      every command is resolved to EVERY declaration that supplies it, every
//      walked fact is resolved to where the tree already says the same thing,
//      every count is compared with a MEASUREMENT rather than with other prose,
//      and the dependency closure of the copied tier is measured off the spine's
//      own imports. This is what would have caught the rot the root README
//      carried for a whole phase.
//   2. THE BLOCK/ALLOW PAIR. §15.2's bar: the pure checker is run over
//      checked-in violating inputs it must reject case by case, and a compliant
//      set it must pass in silence. Each rejection is asserted against its own
//      message, so weakening one predicate goes red on its own.
//   3. THE WALK. The layers above prove the list is CONSISTENT with the tree.
//      Only this one proves the list WORKS: the live `src/spine/` is copied into
//      a scratch tree beside the adopter template the step list describes, and
//      then THE COMMANDS STEP 6 INSTRUCTS ARE RUN — `npm run typecheck` and
//      `npm run demo`, through the template's own manifest, not the binaries
//      those scripts happen to wrap. A walk that drove `tsc` and `tsx` directly
//      proved the code compiles and left the instruction unchecked: measured,
//      the template's whole `scripts` table could be deleted and the suite
//      stayed green. `npm install` stays out — the two `@adr/*` links are built
//      by hand so the gate remains offline — and that residue is the one part
//      of step 6 this walk simulates rather than executes.
//
// WHY THE WALK IS TYPESCRIPT-ONLY, dated 2026-08-01 and scoped rather than
// forgotten: the Kotlin equivalent is a Gradle build, and driving Gradle from
// inside vitest would put a JVM toolchain and a Maven Central resolve on the
// TypeScript port's critical path. The Kotlin list's own walked facts were
// executed by hand against this tree on 2026-08-01 —
// `./gradlew :block:console:compileKotlin` after moving `Contract.kt` out of
// `:spine` (which produced the sealed-hierarchy refusal the list quotes), and
// again after appending a real fifteenth verb (which produced the `'when'
// expression must be exhaustive` line and nothing else) — and each is pinned to
// a place the LIVE TREE still says the same thing, which is the part a re-run
// would otherwise be needed for. The root README states that split rather than
// claiming both lists are re-executed, and `GATE_SPLIT` is what holds it there.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BEGIN,
  BLOCK_TRANSPORT,
  type CountClaim,
  compilerOptionDrift,
  END,
  FRAGMENT,
  GATE_SPLIT,
  HEADING,
  isBlockTransport,
  KT_COMMANDS,
  KT_FACTS,
  KT_PATHS,
  MANDATORY_INSTALL,
  namedPaths,
  type QuickstartCorpus,
  quickstartProblems,
  ROOT_POINTERS,
  ROOT_VERB_LOCUS,
  steps,
  TS_COMMANDS,
  TS_FACTS,
  TS_PATHS,
  VERB_COST,
  WALK_MANIFEST,
} from "./quickstart";

const HERE = dirname(new URL(import.meta.url).pathname);
const PORT = join(HERE, "..", "..");
const REPO = join(PORT, "..", "..");

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const TS_README = "examples/typescript/README.md";
const KT_README = "examples/kotlin/README.md";
const TS_BASE_CONFIG = "examples/typescript/tsconfig.base.json";
const WALK_BASE_CONFIG =
  "examples/typescript/test/laws/fixtures/quickstart/walk/tsconfig.base.json";

const tsReadme = read(TS_README);
const ktReadme = read(KT_README);
const rootReadme = read("README.md");

/** Every file either list resolves a claim against, read once. The adopter
 *  template's manifest is in here because four TypeScript commands resolve
 *  against it — it is the one artifact in this repository that models what the
 *  READER's manifest has to hold. */
const declarationPaths = [
  ...[...TS_COMMANDS, ...KT_COMMANDS].flatMap((c) => c.sites.map((s) => s.declaredIn)),
  ...[...TS_FACTS, ...KT_FACTS].map((f) => f.anchoredIn),
];

const declarations = new Map(declarationPaths.map((path) => [path, read(path)]));

const present = new Set(
  [...TS_PATHS, ...KT_PATHS].flatMap((claim) =>
    existsSync(join(REPO, claim.path)) ? [claim.path] : [],
  ),
);

const files = (relative: string, pattern: string): string[] =>
  execFileSync(
    "find",
    [
      join(REPO, relative),
      // A BUILD OUTPUT IS NOT A FILE AN ADOPTER COPIES. Measured: a tree with
      // `examples/kotlin/spine/build/` present counted 399 where the source
      // folder holds 45, and a count check that moves when someone ran Gradle
      // is a count check nobody can keep green.
      "-not",
      "-path",
      "*/build/*",
      "-not",
      "-path",
      "*/.gradle/*",
      "-type",
      "f",
      "-name",
      pattern,
    ],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((line) => line !== "");

// ── THE DEPENDENCY CLOSURE OF THE COPIED TIER, measured ───────────────────
// Every BARE specifier any spine file imports. Not an enumerated package list:
// a new spine dependency has to redden the step list on the day it lands, and a
// list typed here would have to be edited in step with the thing it polices.
const BARE_SPECIFIER = /(?:\bfrom|\bimport|\brequire\()\s*"([^"]+)"/g;

const spineExternals = [
  ...new Set(
    files("examples/typescript/src/spine", "*.ts").flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(BARE_SPECIFIER)]
        .map((m) => String(m[1]))
        .filter((spec) => !spec.startsWith(".") && !spec.startsWith("@adr/")),
    ),
  ),
].sort();

// ── the counts, MEASURED off the tree ─────────────────────────────────────
// Each `measured` is a walk of the real folder, so a file added to either spine
// turns the prose red rather than leaving it quietly wrong. `said` is EXTRACTED
// from the README with a pinned pattern rather than typed here — a number this
// file supplied on both sides would be comparing the checker with itself.
//
// NO COUNT IS BAKED INTO A PATTERN. An earlier draft wrote `(\d+) of those 44`,
// which stops matching the moment the 44 moves: the extraction then reports
// "missing" for a sentence that is present and the message names the wrong
// failure. Every pattern below carries exactly one capture and no other digit.

const said = (text: string, pattern: RegExp): number => {
  const found = pattern.exec(text);
  // -1, never 0 and never a throw: a missing sentence has to be REPORTED by the
  // same checker the fixtures drive, not crash the run before it gets there.
  return found === null ? -1 : Number(found[1]);
};

/** The sentences the counts live in, pinned as patterns. Rewording a sentence is
 *  free; deleting the number is not. */
export const TS_FOLDER = /the folder holds (\d+) entries/;
export const TS_ROSTER = /the (\d+) `\.ts` this port's roster pin names/;
export const KT_FOLDER = /the folder holds (\d+) entries/;
export const KT_ALL_KT = /— (\d+) `\.kt` plus that build script/;
export const KT_FOREIGN = /(\d+) of them are not spine at all/;
export const KT_ROSTER = /Delete them and (\d+) `\.kt` remain/;

const tsSteps = steps(tsReadme) ?? "";
const ktSteps = steps(ktReadme) ?? "";

const ktSpineKt = files("examples/kotlin/spine", "*.kt");
const ktForeign = ktSpineKt.filter(isBlockTransport);

const counts: readonly CountClaim[] = [
  {
    what: "the TypeScript spine folder",
    said: said(tsSteps, TS_FOLDER),
    measured: files("examples/typescript/src/spine", "*").length,
  },
  {
    what: "the TypeScript spine roster",
    said: said(tsSteps, TS_ROSTER),
    measured: files("examples/typescript/src/spine", "*.ts").length,
  },
  {
    what: "the Kotlin spine folder",
    said: said(ktSteps, KT_FOLDER),
    measured: files("examples/kotlin/spine", "*").length,
  },
  {
    what: "the Kotlin spine's Kotlin files",
    said: said(ktSteps, KT_ALL_KT),
    measured: ktSpineKt.length,
  },
  {
    what: "the block transport an adopter deletes",
    said: said(ktSteps, KT_FOREIGN),
    measured: ktForeign.length,
  },
  {
    what: "the Kotlin spine roster",
    said: said(ktSteps, KT_ROSTER),
    measured: ktSpineKt.length - ktForeign.length,
  },
];

const live: QuickstartCorpus = {
  tsReadme,
  ktReadme,
  rootReadme,
  present,
  declarations,
  counts,
  spineExternals,
};

describe("the quickstart's every claim is resolved against the live tree", () => {
  it("the LIVE tree passes every rule", () => {
    expect(quickstartProblems(live)).toEqual([]);
  });

  it("EVERY path the step lists name resolves on disk — derived, not rostered", () => {
    // The round-2 finding: the seventeen-row roster checks the paths it lists,
    // and a reviewer rotted two block names inside the Kotlin brace set — the
    // input to the step list's one destructive instruction — with every gate
    // green. The census is DERIVED now: every backticked path-shaped token in
    // each delimited region, brace groups expanded, resolved against that
    // port's root. The rosters stay for what they alone bind (a step that must
    // name a path); this binds every named path to disk.
    const resolveAll = (list: string, root: string): string[] =>
      namedPaths(list).filter((token) => !existsSync(join(REPO, root, token)));
    expect(resolveAll(tsSteps, "examples/typescript")).toEqual([]);
    expect(resolveAll(ktSteps, "examples/kotlin")).toEqual([]);
    // Vacuity floor: the derivation actually extracted a census, including the
    // six brace-expanded transport paths the destructive instruction names.
    expect(namedPaths(tsSteps).length).toBeGreaterThanOrEqual(10);
    expect(namedPaths(ktSteps).length).toBeGreaterThanOrEqual(12);
  });

  it("DENIES a rotted brace name — the reviewer's own mutation", () => {
    const rotted = ktSteps.replace("{triage,", "{triange,");
    expect(rotted).not.toBe(ktSteps);
    const missing = namedPaths(rotted).filter(
      (token) => !existsSync(join(REPO, "examples/kotlin", token)),
    );
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing.join("\n")).toContain("triange");
  });

  it("the corpus is not empty — an unread README would pass everything", () => {
    expect(tsSteps.length).toBeGreaterThan(1000);
    expect(ktSteps.length).toBeGreaterThan(1000);
    expect(present.size).toBe(TS_PATHS.length + KT_PATHS.length);
    expect(declarations.size).toBeGreaterThanOrEqual(6);
    expect(declarations.get(WALK_MANIFEST)).toBeDefined();
  });

  it("every count was EXTRACTED, not assumed — a dropped sentence is -1, not silence", () => {
    for (const count of counts) {
      expect(count.said, count.what).toBeGreaterThan(0);
      expect(count.said, count.what).toBe(count.measured);
    }
    // …and the two Kotlin sub-counts partition the folder, so the roster number
    // cannot be right by coincidence while its two parts are wrong.
    const kt = Object.fromEntries(counts.map((c) => [c.what, c.measured]));
    expect(kt["the Kotlin spine roster"]).toBe(
      (kt["the Kotlin spine's Kotlin files"] ?? 0) -
        (kt["the block transport an adopter deletes"] ?? 0),
    );
  });

  it("the DEPENDENCY CLOSURE is measured, non-empty, and named by the step list", () => {
    // ANTI-VACUITY, and it is the whole reason this rule can be trusted: a walk
    // that found no specifiers would pass the closure rule by measuring air.
    expect(spineExternals.length).toBeGreaterThanOrEqual(2);
    expect(spineExternals).toEqual(["@valibot/to-json-schema", "ai"]);
    // and the sentence that carries them is a LINE the checker extracts, not
    // prose it hopes for.
    const line = MANDATORY_INSTALL.exec(tsSteps);
    expect(line).not.toBeNull();
    const named = String(line?.[1]).trim().split(/\s+/);
    for (const external of spineExternals) expect(named).toContain(external);
    // `valibot` is the block's, not the spine's — measured, and named anyway,
    // because step 4 cannot be followed without it.
    expect(named).toContain("valibot");
  });

  it("the BLOCK-TRANSPORT predicate denies the FORM, not a spelling", () => {
    // The measured six, and then the two cases an enumerated `[a-z]+` missed.
    expect(ktForeign.length).toBe(6);
    expect(isBlockTransport("spine/src/main/kotlin/adr/blocks/tier2/Contract.kt")).toBe(true);
    expect(isBlockTransport("spine/src/main/kotlin/adr/blocks/dead_letter/Contract.kt")).toBe(true);
    expect(isBlockTransport("spine/src/main/kotlin/adr/spine/pure/Version.kt")).toBe(false);
    expect(isBlockTransport("spine/src/main/kotlin/adr/blocks/console/Tools.kt")).toBe(false);
  });

  it("the ADOPTER TEMPLATE compiles under THIS port's contract, not a frozen copy", () => {
    const port = JSON.parse(read(TS_BASE_CONFIG)) as { compilerOptions: Record<string, unknown> };
    const template = JSON.parse(read(WALK_BASE_CONFIG)) as {
      compilerOptions: Record<string, unknown>;
    };
    expect(Object.keys(port.compilerOptions).length).toBeGreaterThanOrEqual(10);
    expect(
      compilerOptionDrift(
        port.compilerOptions,
        template.compilerOptions,
        TS_BASE_CONFIG,
        WALK_BASE_CONFIG,
      ),
    ).toEqual([]);
  });

  it("PINS THE PREDICATES — a weakened extraction is a visible diff, not a silence", () => {
    expect(BEGIN).toBe("<!-- quickstart:begin -->");
    expect(END).toBe("<!-- quickstart:end -->");
    expect(HEADING).toBe("## Day one: a working one-verb app");
    expect(FRAGMENT).toBe("#day-one-a-working-one-verb-app");
    expect(TS_FOLDER.source).toBe("the folder holds (\\d+) entries");
    expect(KT_FOREIGN.source).toBe("(\\d+) of them are not spine at all");
    expect(KT_ROSTER.source).toBe("Delete them and (\\d+) `\\.kt` remain");
    expect(MANDATORY_INSTALL.source).toBe("^Mandatory install: `npm i ([^`]+)`$");
    expect(VERB_COST.source).toBe("(\\d+)\\s+appends?,\\s*(\\d+)\\s+files?,\\s*([^.\\n]*)");
    // Moved DELIBERATELY, narrowing a false positive: the bare co-occurrence
    // form accused a true, port-neutral sentence ("a verb's cost is measured
    // per port, in that port's README") of stating a locus. The pattern now
    // requires what the message accuses — a quantified locus or a locus verb.
    expect(ROOT_VERB_LOCUS.source).toBe(
      "\\bverbs?\\b[^.\\n]*(?:\\b(?:\\d+|one|two|three|a\\s+single)\\s+(?:\\w+\\s+)?(?:folders?|modules?|files?)\\b|" +
        "\\b(?:stays?|lands?)\\s+(?:inside|in)\\b|" +
        "\\binside\\s+(?:one|its\\s+own|a\\s+single)\\s+(?:\\w+\\s+)?(?:folders?|modules?)\\b)|" +
        "(?:\\b(?:\\d+|one|two|three|a\\s+single)\\s+(?:\\w+\\s+)?(?:folders?|modules?|files?)\\b|" +
        "\\binside\\s+(?:one|its\\s+own|a\\s+single)\\s+(?:\\w+\\s+)?(?:folders?|modules?)\\b)[^.\\n]*\\bverbs?\\b",
    );
    expect(BLOCK_TRANSPORT.source).toBe("\\/adr\\/blocks\\/[^/]+\\/Contract\\.kt$");
    expect(GATE_SPLIT).toContain("re-executed end to end by the TypeScript gate");
    expect(GATE_SPLIT).toContain("resolved against the live tree by that same gate");
    expect([...ROOT_POINTERS]).toEqual([
      "examples/typescript/README.md#day-one-a-working-one-verb-app",
      "examples/kotlin/README.md#day-one-a-working-one-verb-app",
    ]);
  });

  it("the heading and the root's link are the SAME claim, checked both ways", () => {
    // The book's cross-reference discipline, applied to the one link that
    // carries a reader out of the root README and into a port.
    for (const readme of [tsReadme, ktReadme]) expect(readme).toContain(HEADING);
    for (const pointer of ROOT_POINTERS) {
      expect(rootReadme).toContain(pointer);
      expect(pointer.endsWith(FRAGMENT)).toBe(true);
    }
  });

  it("the ADOPTER READING is stated, not left to the reader to infer", () => {
    // The item's one genuine ambiguity, closed in prose: these lists are for a
    // new repository, and this repository's own pins are not the reader's.
    for (const list of [tsSteps, ktSteps]) {
      expect(list).toContain("YOUR new repository");
    }
  });
});

// ── the block-test: every rule red on its own case ────────────────────────

const fixture = (half: string, name: string): string =>
  readFileSync(join(HERE, "fixtures", "quickstart", half, name), "utf8");

const wrap = (body: string): string => `${BEGIN}\n${body}\n${END}`;
const wholeReadme = (half: string, name: string): string =>
  `${HEADING}\n${wrap(fixture(half, name))}`;

const COMPLIANT: QuickstartCorpus = {
  tsReadme: wholeReadme("compliant", "ts-steps.md"),
  ktReadme: wholeReadme("compliant", "kt-steps.md"),
  rootReadme: fixture("compliant", "root.md"),
  present: new Set([...TS_PATHS, ...KT_PATHS].map((c) => c.path)),
  declarations,
  counts: [{ what: "the spine folder", said: 39, measured: 39 }],
  spineExternals: ["ai", "@valibot/to-json-schema"],
};

const swap = (patch: Partial<QuickstartCorpus>): string[] =>
  quickstartProblems({ ...COMPLIANT, ...patch });

describe("the quickstart check DENIES a step list that has rotted", () => {
  it("REJECTS a README that lost its delimiters entirely", () => {
    expect(swap({ tsReadme: `${HEADING}\nno markers here` })).toContain(
      "the TypeScript README carries no delimited quickstart",
    );
  });

  it("REJECTS a README that renamed the heading the root README links to", () => {
    expect(swap({ ktReadme: wrap(fixture("compliant", "kt-steps.md")) })).toContain(
      "the Kotlin README no longer heads its quickstart `## Day one: a working one-verb app`",
    );
  });

  it("REJECTS a step list that stopped naming a path", () => {
    expect(swap({ tsReadme: wholeReadme("violating", "ts-steps-no-path.md") })).toContain(
      "the TypeScript quickstart no longer names `src/spine/tsconfig.json`",
    );
  });

  it("REJECTS a path that is named but has left the tree — the rot itself", () => {
    const gone = new Set([...COMPLIANT.present].filter((p) => !p.endsWith("/src/app/main.ts")));
    expect(swap({ present: gone })).toContain(
      "the TypeScript quickstart names `src/app/main.ts`, which is not in the tree",
    );
  });

  it("REJECTS a command the list runs that nothing declares any more", () => {
    // The `./gradlew run` case exactly: `:app` drops `application`, the task
    // vanishes, and a quoted-string check would never notice.
    const thinned = new Map(declarations);
    thinned.set("examples/kotlin/app/build.gradle.kts", 'plugins { id("adr.root") }\n');
    expect(swap({ declarations: thinned })).toContain(
      "`./gradlew run` is not declared: examples/kotlin/app/build.gradle.kts no longer holds `application`",
    );
  });

  it("REJECTS a TypeScript command THE ADOPTER'S OWN MANIFEST stopped declaring", () => {
    // The second resolution site, and the reason it exists: these four commands
    // are instructions to a READER. Resolving them only against this port's
    // manifest checked the wrong repository — measured, the whole `scripts`
    // table could be deleted from the template and the suite stayed green.
    const thinned = new Map(declarations);
    thinned.set(WALK_MANIFEST, '{ "workspaces": [], "scripts": { "typecheck": "tsc" } }');
    const problems = swap({ declarations: thinned });
    expect(problems).toContain(
      `\`npm run demo\` is not declared: ${WALK_MANIFEST} no longer holds \`"demo"\``,
    );
    expect(problems).toContain(
      `\`npm test\` is not declared: ${WALK_MANIFEST} no longer holds \`"test"\``,
    );
  });

  it("REJECTS an adopter manifest that dropped `workspaces` — the linking step", () => {
    const thinned = new Map(declarations);
    thinned.set(WALK_MANIFEST, '{ "scripts": { "typecheck": "x", "test": "x", "demo": "x" } }');
    expect(swap({ declarations: thinned })).toContain(
      `\`npm install\` is not declared: ${WALK_MANIFEST} no longer holds \`"workspaces"\``,
    );
  });

  it("REJECTS a list that stopped telling the reader to run anything", () => {
    expect(swap({ ktReadme: wholeReadme("violating", "kt-steps-no-command.md") })).toContain(
      "the Kotlin quickstart no longer runs `./gradlew test --tests 'adr.spine.ReplayTest'`",
    );
  });

  it("REJECTS a rewrite that smoothed away a walked fact", () => {
    // The headline failure mode for a document like this: the sentence that
    // reads like an aside is the one that cost a red run to learn.
    expect(swap({ ktReadme: wholeReadme("violating", "kt-steps-no-fact.md") })).toContain(
      "the Kotlin quickstart dropped a walked fact: `Extending sealed classes or interfaces from a different module is prohibited`",
    );
  });

  it("REJECTS a walked fact whose anchor in the tree has gone", () => {
    const unanchored = new Map(declarations);
    unanchored.set("examples/typescript/src/spine/tsconfig.json", '{ "compilerOptions": {} }');
    expect(swap({ declarations: unanchored })).toContain(
      "the walked fact `../../tsconfig.base.json` is no longer anchored in examples/typescript/src/spine/tsconfig.json",
    );
  });

  it("REJECTS a quoted count the tree disagrees with", () => {
    expect(swap({ counts: [{ what: "the spine folder", said: 36, measured: 39 }] })).toContain(
      "the quickstart says 36 for the spine folder; the tree measures 39",
    );
  });

  it("REJECTS a count SENTENCE that vanished, separately from one that disagrees", () => {
    expect(swap({ counts: [{ what: "the spine folder", said: -1, measured: 39 }] })).toContain(
      "the quickstart no longer states a count for the spine folder",
    );
  });

  it("REJECTS a mandatory install that omits a package the COPIED SPINE imports", () => {
    // The false step, exactly: prose that calls `ai` optional because the app
    // never calls it. Measured outside this repository — the copy does not
    // typecheck, and typecheck is the first command step 6 issues.
    expect(swap({ tsReadme: wholeReadme("violating", "ts-steps-optional-dep.md") })).toContain(
      "the TypeScript quickstart's mandatory install omits `ai`, which the copied spine imports",
    );
  });

  it("REJECTS a step list with no mandatory-install line at all", () => {
    expect(swap({ tsReadme: wholeReadme("violating", "ts-steps-no-install.md") })).toContain(
      "the TypeScript quickstart carries no mandatory-install line",
    );
  });

  it("REJECTS a README that answers the verb-cost question twice, differently", () => {
    // Denied by FORM. The literal "1 folder" is never matched: what is matched
    // is "<n> appends, <m> files, <locus>", so the NEXT wording of the same
    // disagreement is caught too.
    expect(
      swap({
        ktReadme: `${wholeReadme("compliant", "kt-steps.md")}\n${fixture("violating", "kt-verb-cost.md")}`,
      }),
    ).toContain(
      "the Kotlin README states the verb cost twice and they disagree: '4 appends, 3 files, 1 folder' vs '4 appends, 3 files, 2 Gradle modules'",
    );
  });

  it("REJECTS a ROOT README that states WHERE a verb's cost lands", () => {
    const problems = swap({ rootReadme: fixture("violating", "root-verb-locus.md") });
    expect(
      problems.some((p) => /^README\.md:\d+ {2}states WHERE a verb's cost lands/.test(p)),
    ).toBe(true);
  });

  it("REJECTS a root README that claims both lists are held the same way", () => {
    expect(swap({ rootReadme: fixture("violating", "root-no-gate-split.md") })).toContain(
      "the root README no longer states how each port's step list is held",
    );
  });

  it("REJECTS a root README that stopped routing to a port", () => {
    expect(swap({ rootReadme: fixture("violating", "root-one-pointer.md") })).toContain(
      "the root README no longer points at `examples/kotlin/README.md#day-one-a-working-one-verb-app`",
    );
  });

  it("REJECTS an adopter template whose compiler contract drifted from the port's", () => {
    expect(
      compilerOptionDrift(
        { strict: true, target: "ES2023" },
        { strict: false, target: "ES2023" },
        TS_BASE_CONFIG,
        WALK_BASE_CONFIG,
      ),
    ).toEqual([`\`strict\` differs: ${TS_BASE_CONFIG} says true, ${WALK_BASE_CONFIG} says false`]);
  });
});

describe("the quickstart check ALLOWS a coherent step list", () => {
  it("passes the compliant set in silence", () => {
    expect(quickstartProblems(COMPLIANT)).toEqual([]);
  });
});

// ── THE WALK — the list is EXECUTED, not merely consistent ────────────────
// The scratch tree sits inside the port so that `node_modules` resolution keeps
// working by walking up: `valibot`, `ai` and `@valibot/to-json-schema` resolve
// from this port's install exactly as they would from an adopter's, while
// `@adr/spine` and `@adr/block-notes` resolve to the COPY through the scratch
// tree's own `node_modules` — which is what `npm install` does for a workspace
// tree, done directly so the gate stays offline.
//
// THAT SITING IS ALSO THIS LAYER'S ONE BLIND SPOT, and it is named here rather
// than discovered later: a package the copied tier needs but the adopter was
// never told to install resolves up into the port and the walk stays green.
// That hole is closed STATICALLY, by the dependency-closure rule above, which is
// derived from the live tree and does not care where the scratch tree sits.
//
// It is a SUBDIRECTORY of the port's existing `.work/`, which every census,
// ignore list and runner exclude in this port already knows by name. That is
// only safe because test/gate/exhaustiveness.test.ts now cleans up its own
// fixture directories instead of deleting `.work` wholesale — vitest runs the
// two files in parallel, and a wholesale delete would race this one.

const WALK = join(PORT, ".work", "quickstart-walk");
const TEMPLATE = join(HERE, "fixtures", "quickstart", "walk");

function materialise(): string {
  rmSync(WALK, { recursive: true, force: true });
  mkdirSync(join(WALK, "node_modules", "@adr"), { recursive: true });
  cpSync(TEMPLATE, WALK, { recursive: true });
  // THE LIVE TIER, not a copy of a copy. This is the line that keeps the walk
  // from going vacuous the way a frozen fixture would.
  cpSync(join(PORT, "src", "spine"), join(WALK, "src", "spine"), { recursive: true });
  symlinkSync("../../src/spine", join(WALK, "node_modules", "@adr", "spine"), "dir");
  symlinkSync("../../src/blocks/notes", join(WALK, "node_modules", "@adr", "block-notes"), "dir");
  return WALK;
}

const run = (command: string, args: readonly string[]): { code: number; output: string } => {
  try {
    return { code: 0, output: execFileSync(command, [...args], { encoding: "utf8", cwd: PORT }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

/** `npm run <script> --prefix <dir>` — the command the step list instructs,
 *  driven through the ADOPTER'S manifest. It resolves the ancestor
 *  `node_modules/.bin` and needs no network, so the gate stays offline while
 *  the instruction stops being decorative. */
const npmRun = (script: string): { code: number; output: string } =>
  run("npm", ["run", "--prefix", WALK, script]);

/** npm's own `> script` / `> command` banner, dropped so a tool's real output
 *  can be asserted as empty. */
const toolOutput = (output: string): string =>
  output
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith(">"))
    .join("\n");

describe("the walk — an adopter following this list gets a working one-verb app", () => {
  const dir = materialise();

  it("`npm run typecheck` — the FIRST command step 6 issues — passes on the copy", () => {
    // Step 2's non-obvious half is load-bearing here: without the walk's own
    // `tsconfig.base.json` the copied `src/spine/tsconfig.json` cannot resolve
    // its `extends`, which is exactly what the step list warns about.
    const result = npmRun("typecheck");
    expect(toolOutput(result.output)).toBe("");
    expect(result.code).toBe(0);
  });

  it("the block's own co-located TEST runs and passes", () => {
    const result = run(join(PORT, "node_modules", ".bin", "vitest"), ["run", "--root", dir]);
    expect(result.output).toContain("1 passed");
    expect(result.code).toBe(0);
  });

  it("`npm run demo` RUNS, and the session re-derives from the bus alone", () => {
    const result = npmRun("demo");
    expect(result.code).toBe(0);
    // The block's effect handler fired, through the root's assembled table.
    expect(result.output).toContain("[note @1000] the refund never arrived");
    // Two actors, one stream: a controller action and an agent step.
    expect(result.output).toContain("[bus]     2 committed step(s)");
    // THE FOURTH BEAT, and the assertion the whole walk exists for.
    expect(result.output).toContain(
      "[replay]  state and full effect sequence re-derived from the bus: true",
    );
  });

  it("the step list's own claim about that output is the output", () => {
    // The prose quotes three lines of the walk's stdout. Quoting stdout is a
    // claim, so it is read back rather than trusted.
    const result = npmRun("demo");
    const quoted = result.output
      .split("\n")
      .filter((l) => l.startsWith("[state]") || l.startsWith("[bus]") || l.startsWith("[replay]"));
    expect(quoted).toHaveLength(3);
    for (const line of quoted) expect(tsSteps).toContain(line);
  });

  afterAll(() => {
    rmSync(WALK, { recursive: true, force: true });
  });
});
