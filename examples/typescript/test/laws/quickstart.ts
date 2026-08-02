// ── THE QUICKSTART CHECK — a day-one step list that cannot rot ────────────
//
// The two ports' READMEs carry a walked, executable step list: copy the spine,
// register one verb, run the test, watch a session replay. Every step in both
// lists was EXECUTED before it was written, and this module is what keeps it
// that way.
//
// THE HOLE IT CLOSES IS ALREADY REALISED, and both gates concede it in writing.
// `test/gate/gate.test.ts` and the Kotlin `GateTest.kt` each say, verbatim,
// "this port's README quotes the number; the README text is not itself
// measured, so a README that disagrees with this pin is a review catch, not a
// build catch." Nothing in either port read a README's paths, its commands or
// its counts, and a step list is nothing but paths, commands and counts. A
// quickstart written into that silence is stale the first time a folder moves.
//
// SIX CLASSES OF CLAIM ARE READ, and the split is deliberate — each one can go
// wrong on its own and each has its own failure message:
//
//   · A PATH the list names. It must be SPELLED in the step list and it must
//     RESOLVE in the live tree. Both halves are needed and neither is enough: a
//     path that resolves but is never named is a step the reader cannot follow,
//     and a path that is named but does not resolve is the rot itself.
//   · A COMMAND the list tells the reader to run. Resolved to the DECLARATIONS
//     that make it exist — an npm script key, or the Gradle plugin/class/file
//     that supplies the task — never to a string that merely looks like a
//     command. A command may have MORE THAN ONE resolution site, and the four
//     TypeScript ones do: an instruction addressed to an ADOPTER has to hold in
//     the adopter's manifest, not only in this port's, so each resolves in BOTH
//     `examples/typescript/package.json` and the adopter template the walk
//     materialises. A single-site version of this rule read as a check on this
//     repository while claiming to be a check on the reader's.
//   · A WALKED FACT: something the implementer learned by executing the step
//     and could not have learned by reading. The spine's own tsconfig extending
//     a file two levels up, the Kotlin compiler's refusal to extend a sealed
//     type across a module edge, Gradle's refusal to configure a directoryless
//     project. These are the sentences a rewrite is likeliest to smooth away,
//     so each is pinned as a literal the prose must keep naming.
//   · A COUNT the list quotes, compared with the TREE and never with another
//     piece of prose. A count SENTENCE that disappears is reported on its own,
//     separately from a count that disagrees, because those are different
//     failures with different fixes.
//   · THE DEPENDENCY CLOSURE of the copied tier. This one is derived rather
//     than enumerated, and it is the rule the first version of this module
//     needed most: step 2 copies the WHOLE spine folder and the template root
//     config is `include: ["src"]`, so every bare specifier any spine file
//     imports is in the ADOPTER'S PROGRAM whether or not the adopter's app ever
//     calls it. Measured outside this repository, a copy missing them fails the
//     FIRST command step 6 issues, with `error TS2307: Cannot find module 'ai'`.
//     Prose calling such a package optional is false at TYPECHECK, and no
//     amount of running the walk INSIDE this port can catch it: resolution
//     walks up into the port's own install. So the rule is static and
//     tree-derived — the caller measures the specifiers, the list must name
//     them — and a NEW spine dependency reddens it on the day it lands.
//   · THE VERB COST, per README, denied BY FORM. A port README may state what a
//     new verb costs as often as it likes; every statement in one file must
//     agree, in appends, in files and in LOCUS. The root README may not state a
//     locus at all: where a verb's cost lands is a port-fact, and the decoupling
//     rule puts port-facts in the ports' own READMEs (docs/DECISIONS.md:147).
//
// IT IS DELIBERATELY NOT A NEW LAW (G-registry closed; 16.4's bar is a named
// production failure, and a documentation rule is not one). It is a gated test
// wired into `npm test`, the precedent `test/laws/release.ts` set one landing
// earlier and the shape this module copies down to the pure/live split.
//
// THE PURE HALF IS THIS FILE: it takes texts and sets and reports problems, so
// the SAME function judges the live tree and a checked-in violating/compliant
// pair. §15.2's bar applies here like everywhere else.

/** One path a step list names, and where it has to resolve. `named` is the
 *  port-relative spelling a reader sees; `path` is the repo-relative one the
 *  caller resolves on disk. Two fields rather than one because the step lists
 *  are written from inside their port and the tree is walked from the repo
 *  root — collapsing them would force one of the two to be wrong. */
export interface PathClaim {
  readonly named: string;
  readonly path: string;
}

/** ONE PLACE A COMMAND IS DECLARED. `declaredIn` is a repo-relative file and
 *  `token` is the text in it whose deletion removes the command. */
export interface CommandSite {
  readonly declaredIn: string;
  readonly token: string;
}

/** One command a step list tells the reader to run, plus EVERY declaration that
 *  has to supply it. A command row with no site is a string, and a string
 *  cannot go stale visibly; a command addressed to an adopter with only THIS
 *  repository's site is a check on the wrong manifest. */
export interface CommandClaim {
  readonly command: string;
  readonly sites: readonly CommandSite[];
}

/** The adopter template the walk materialises — a second manifest, owned by
 *  this repository but standing in for the reader's. It is the only artifact
 *  here that models what an adopter's `package.json` has to hold. */
export const WALK_MANIFEST = "examples/typescript/test/laws/fixtures/quickstart/walk/package.json";
const TS_MANIFEST = "examples/typescript/package.json";

/** Every TypeScript command resolves TWICE: here, and in the adopter template.
 *  `npm install` resolves to `workspaces` in both, because the step list calls
 *  the workspace list "what turns `npm install` into the linking step". */
const both = (command: string, token: string): CommandClaim => ({
  command,
  sites: [
    { declaredIn: TS_MANIFEST, token },
    { declaredIn: WALK_MANIFEST, token },
  ],
});

/** The TypeScript step list's paths. Every one of these was opened during the
 *  walk that produced the list. */
export const TS_PATHS: readonly PathClaim[] = [
  { named: "src/spine/", path: "examples/typescript/src/spine" },
  { named: "src/spine/package.json", path: "examples/typescript/src/spine/package.json" },
  { named: "src/spine/tsconfig.json", path: "examples/typescript/src/spine/tsconfig.json" },
  { named: "src/spine/pure/version.ts", path: "examples/typescript/src/spine/pure/version.ts" },
  { named: "src/spine/agent/loop.ts", path: "examples/typescript/src/spine/agent/loop.ts" },
  { named: "tsconfig.base.json", path: "examples/typescript/tsconfig.base.json" },
  { named: "src/blocks/console/", path: "examples/typescript/src/blocks/console" },
  { named: "src/app/wire.ts", path: "examples/typescript/src/app/wire.ts" },
  { named: "src/app/main.ts", path: "examples/typescript/src/app/main.ts" },
];

/** The Kotlin step list's paths. `spine/src/main/kotlin/adr/blocks` is the one
 *  that matters most: it is where a block's transport lives, INSIDE the
 *  vendored module, and a reader who does not see it authors a file the
 *  compiler will refuse. */
export const KT_PATHS: readonly PathClaim[] = [
  { named: "spine/build.gradle.kts", path: "examples/kotlin/spine/build.gradle.kts" },
  {
    named: "spine/src/main/kotlin/adr/blocks/",
    path: "examples/kotlin/spine/src/main/kotlin/adr/blocks",
  },
  {
    named: "spine/src/main/kotlin/adr/spine/pure/Version.kt",
    path: "examples/kotlin/spine/src/main/kotlin/adr/spine/pure/Version.kt",
  },
  { named: "settings.gradle.kts", path: "examples/kotlin/settings.gradle.kts" },
  { named: "build-logic/", path: "examples/kotlin/build-logic" },
  {
    named: "block/console/src/main/kotlin/adr/blocks/console/Fold.kt",
    path: "examples/kotlin/block/console/src/main/kotlin/adr/blocks/console/Fold.kt",
  },
  {
    named: "block/console/adapter/build.gradle.kts",
    path: "examples/kotlin/block/console/adapter/build.gradle.kts",
  },
  {
    named: "src/test/kotlin/adr/spine/ReplayTest.kt",
    path: "examples/kotlin/src/test/kotlin/adr/spine/ReplayTest.kt",
  },
];

/** The TypeScript commands, each resolved in BOTH manifests. */
export const TS_COMMANDS: readonly CommandClaim[] = [
  both("npm install", '"workspaces"'),
  both("npm test", '"test"'),
  both("npm run typecheck", '"typecheck"'),
  both("npm run demo", '"demo"'),
];

/** The Kotlin commands, each resolved to the declaration that supplies the
 *  task. `run` is the one that would rot silently: it exists only because
 *  `:app` applies `application` and names a main class, and neither fact is
 *  visible from the command. There is no second manifest here — a Gradle build
 *  script is not a file an adopter copies verbatim, so the honest resolution
 *  site is the one that declares the task in this tree. */
export const KT_COMMANDS: readonly CommandClaim[] = [
  {
    command: "./gradlew --console=plain check",
    sites: [{ declaredIn: "examples/kotlin/build.gradle.kts", token: 'kotlin("jvm")' }],
  },
  {
    command: "./gradlew run",
    sites: [{ declaredIn: "examples/kotlin/app/build.gradle.kts", token: "application" }],
  },
  {
    command: "./gradlew test --tests 'adr.spine.ReplayTest'",
    sites: [
      {
        declaredIn: "examples/kotlin/src/test/kotlin/adr/spine/ReplayTest.kt",
        token: "class ReplayTest",
      },
    ],
  },
];

/** THE WALKED FACTS. Each is something the step list can only state because
 *  somebody ran the step, and each is the sentence an edit is likeliest to
 *  smooth away because it reads like an aside. `anchoredIn` is where the same
 *  text is already true in the tree, so the pin is a RELATIONSHIP rather than a
 *  literal this file invented. */
export interface WalkedFact {
  readonly literal: string;
  readonly anchoredIn: string;
}

export const TS_FACTS: readonly WalkedFact[] = [
  // The copied spine folder is not self-contained: its own tsconfig reaches two
  // levels up. Measured — without this file the walk's vitest run fails with
  // "Failed to load tsconfig for src/spine/pure/actor.ts: Tsconfig not found".
  {
    literal: "../../tsconfig.base.json",
    anchoredIn: "examples/typescript/src/spine/tsconfig.json",
  },
  // The line the fourth beat actually prints. Asserted against the walk's real
  // stdout in quickstart.test.ts, so this is not a wish about wording.
  { literal: "re-derived from the bus", anchoredIn: "examples/typescript/src/app/demo.ts" },
];

export const KT_FACTS: readonly WalkedFact[] = [
  // The compiler's own words, red-proven by moving a block's Contract.kt out of
  // `:spine`. Anchored in the spine's build script, which already quotes it.
  {
    literal: "Extending sealed classes or interfaces from a different module is prohibited",
    anchoredIn: "examples/kotlin/spine/build.gradle.kts",
  },
  // Gradle's own words. Anchored in settings, which records the same measurement.
  {
    // The contiguous half of Gradle's own refusal. settings.gradle.kts WRAPS the
    // sentence across two comment lines, and a literal that spans a line break
    // anchors to nothing — measured, not assumed.
    literal: "without an existing directory",
    anchoredIn: "examples/kotlin/settings.gradle.kts",
  },
  // The asymmetry the item asked for by name: the Kotlin demo has no replay
  // beat, so the fourth step is a test invocation and the list must say so.
  { literal: "ReplayTest", anchoredIn: "examples/kotlin/src/test/kotlin/adr/spine/ReplayTest.kt" },
];

/** A count the step list quotes, and the measurement it has to equal. `said` is
 *  -1 when the sentence carrying the number is GONE, which is a different
 *  failure from a number that disagrees and gets its own message. */
export interface CountClaim {
  readonly what: string;
  readonly said: number;
  readonly measured: number;
}

/** Everything the checker is handed. Pure: no path in here is opened by this
 *  module, which is what lets the fixtures be plain text. */
export interface QuickstartCorpus {
  /** `examples/typescript/README.md`, whole */
  readonly tsReadme: string;
  /** `examples/kotlin/README.md`, whole */
  readonly ktReadme: string;
  /** the repo root `README.md`, whole */
  readonly rootReadme: string;
  /** repo-relative paths that exist in the tree */
  readonly present: ReadonlySet<string>;
  /** repo-relative file → its text, for every command site and fact anchor */
  readonly declarations: ReadonlyMap<string, string>;
  /** the counts, already measured by the caller */
  readonly counts: readonly CountClaim[];
  /** every BARE module specifier the copied spine imports, measured off the
   *  live tree by the caller. Anything not starting with `.` or `@adr/`. */
  readonly spineExternals: readonly string[];
}

/** The delimiters. A step list is a REGION of a README rather than the whole
 *  file, because the rest of the README legitimately talks about the reference
 *  application and would satisfy half these pins by accident. */
export const BEGIN = "<!-- quickstart:begin -->";
export const END = "<!-- quickstart:end -->";

/** Every backticked, PATH-SHAPED token in a step list, `{a,b}` brace groups
 *  expanded — the DERIVED census behind the hand-kept claim rosters above.
 *
 *  The rosters alone were the round-2 finding: seventeen rows, hand-typed, and
 *  a reviewer rotted two block names inside the step list's brace set — the
 *  input to its ONE destructive instruction — with every gate green, because a
 *  roster checks the paths it lists and a step list can name paths it does
 *  not. This extracts every token a reader would treat as a path (backticked,
 *  carries a `/`, free of spaces, globs, placeholders (`<X>`), interpolation
 *  and scoped-package `@` prefixes; a `:<line>` suffix is dropped; a leading
 *  `./` marks a manifest-exports subpath spec, not a file, and is skipped) so
 *  the caller can resolve EACH against the tree. The rosters stay: they bind
 *  paths to the steps that must name them; this binds every named path to
 *  disk. */
export function namedPaths(list: string): string[] {
  const out: string[] = [];
  for (const match of list.matchAll(/`([^`\n]+)`/g)) {
    const raw = (match[1] ?? "").replace(/:\d+(?:-\d+)?$/, "");
    if (!raw.includes("/") || /[\s*<>$@]/.test(raw) || raw.startsWith("./")) continue;
    const brace = /\{([^{}]+)\}/.exec(raw);
    if (brace === null) {
      out.push(raw);
      continue;
    }
    for (const piece of (brace[1] ?? "").split(",")) {
      out.push(raw.slice(0, brace.index) + piece.trim() + raw.slice(brace.index + brace[0].length));
    }
  }
  return out;
}

/** The step list a README carries, or null when it carries none. Null rather
 *  than "" so a README that lost its markers reports a MISSING list instead of
 *  passing every "does not contain" rule vacuously. */
export function steps(readme: string): string | null {
  const from = readme.indexOf(BEGIN);
  const to = readme.indexOf(END);
  if (from < 0 || to < 0 || to < from) return null;
  return readme.slice(from + BEGIN.length, to);
}

/** THE HEADING, and it is load-bearing twice. It is what a reader scans for,
 *  and it is what GitHub derives the fragment in `ROOT_POINTERS` from — so the
 *  heading and the link are the two coordinates of one claim, checked in both
 *  directions exactly as the book's cross-references are. Rename the heading
 *  without moving the link and the root README points at nothing. */
export const HEADING = "## Day one: a working one-verb app";

/** GitHub's fragment for that heading: lower-cased, spaces to hyphens,
 *  punctuation dropped. Derived here rather than typed twice. NOT a general
 *  slugger — it is asserted as a literal for the one heading it serves. */
export const FRAGMENT = `#${HEADING.replace(/^#+\s*/, "")
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, "")
  .trim()
  .replace(/\s+/g, "-")}`;

/** The two pointers the root README owes the two lists. It is the entry point a
 *  reader lands on, and the decoupling law puts the port-facts in the ports'
 *  own READMEs (docs/DECISIONS.md:147) — so the root's whole job here is to
 *  route, and a route that stops existing is the quickstart becoming
 *  unfindable. */
export const ROOT_POINTERS = [
  `examples/typescript/README.md${FRAGMENT}`,
  `examples/kotlin/README.md${FRAGMENT}`,
] as const;

/** WHAT THE ROOT SAYS ABOUT HOW THE TWO LISTS ARE HELD, and it is a required
 *  literal rather than a denied string because a rewrite drops a literal and
 *  routes around a denial. The two halves are NOT the same strength and the
 *  sentence says so: the TypeScript list is re-executed — copied, typechecked,
 *  tested and run, on every `npm test` — while the Kotlin list is RESOLVED, its
 *  every path, command, count and walked fact checked against the live tree by
 *  that same gate. Measured: corrupting three Kotlin step-list claims still
 *  yields `BUILD SUCCESSFUL`, and the Kotlin gate's own `GateTest.kt` says in
 *  writing that the README text is not measured. Claiming both are re-executed
 *  is the overclaim this literal exists to stop.
 *
 *  Compared with whitespace COLLAPSED, so a reflow of the paragraph is free and
 *  a rewrite of the claim is not — the same normalisation dependency-rule.test
 *  applies to its own canonical sentence. */
export const GATE_SPLIT =
  "the TypeScript list is re-executed end to end by the TypeScript gate, and the Kotlin " +
  "list's every path, command, count and walked fact is resolved against the live tree by " +
  "that same gate";

export const collapse = (text: string): string => text.replace(/\s+/g, " ");

/** THE MANDATORY-INSTALL LINE. One line, one command, extracted by ONE pattern,
 *  so the packages it names are DATA the checker compares with a measurement
 *  rather than prose a reader has to trust. */
export const MANDATORY_INSTALL = /^Mandatory install: `npm i ([^`]+)`$/m;

/** A VERB-COST STATEMENT, by FORM. Any "<n> appends, <m> files, <locus>",
 *  wherever it appears in a port README and however it is worded around. The
 *  locus runs to the end of the clause, so "1 folder" and "2 Gradle modules"
 *  are different answers to the same question — which is exactly the drift this
 *  denies. Enumerating the literal "1 folder" would have caught one spelling
 *  and slept through the next. */
export const VERB_COST = /(\d+)\s+appends?,\s*(\d+)\s+files?,\s*([^.\n]*)/g;

/** A LOCUS CLAIM ABOUT A VERB IN THE ROOT README, in either order, within one
 *  clause. WHERE a verb's cost lands is a port-fact: it is one folder in the
 *  TypeScript port and two Gradle modules in the Kotlin one, so any single
 *  answer at the root is false for one of them (docs/DECISIONS.md:147).
 *
 *  DENIED BY A COST/LOCUS SHAPE, NOT BY BARE CO-OCCURRENCE. The first shipping
 *  fired on any clause holding "verb" near "folder/module/file", and a
 *  reviewer appended a TRUE, port-neutral sentence — a verb's cost "is
 *  measured per port, in that port's README" — that the rule accused of
 *  stating a locus. What the message accuses is what the pattern requires
 *  now: a QUANTIFIED locus ("4 files", "one folder is two directories" rides
 *  the quantifier) or a locus verb ("stays inside", "lands in"). */
export const ROOT_VERB_LOCUS =
  /\bverbs?\b[^.\n]*(?:\b(?:\d+|one|two|three|a\s+single)\s+(?:\w+\s+)?(?:folders?|modules?|files?)\b|\b(?:stays?|lands?)\s+(?:inside|in)\b|\binside\s+(?:one|its\s+own|a\s+single)\s+(?:\w+\s+)?(?:folders?|modules?)\b)|(?:\b(?:\d+|one|two|three|a\s+single)\s+(?:\w+\s+)?(?:folders?|modules?|files?)\b|\binside\s+(?:one|its\s+own|a\s+single)\s+(?:\w+\s+)?(?:folders?|modules?)\b)[^.\n]*\bverbs?\b/g;

/** A BLOCK'S TRANSPORT INSIDE THE VENDORED KOTLIN MODULE, by FORM. Kotlin's
 *  sealed rule puts every block's `Contract.kt` in `:spine`, so those files sit
 *  under the spine folder while belonging to the blocks — the measurement the
 *  Kotlin step list turns into a delete instruction. The directory segment is
 *  `[^/]+`, NOT an enumerated set and not `[a-z]+`: a block folder carrying a
 *  digit is still a block folder, and a rule that missed it would count that
 *  file into the spine roster and report a number nobody can act on. */
export const BLOCK_TRANSPORT = /\/adr\/blocks\/[^/]+\/Contract\.kt$/;

export function isBlockTransport(path: string): boolean {
  return BLOCK_TRANSPORT.test(path);
}

/** Compiler options the adopter template shares with this port, compared key by
 *  key so the message names the KEY and BOTH files. The template's own `//`
 *  documentation key is out of scope: it is prose about the file, not a
 *  compiler contract. A frozen hand copy of a config nothing holds equal is the
 *  vacuous fixture in miniature — it stands for the live one only until the
 *  live one moves. */
export function compilerOptionDrift(
  port: Record<string, unknown>,
  template: Record<string, unknown>,
  portPath: string,
  templatePath: string,
): string[] {
  const problems: string[] = [];
  const keys = [...new Set([...Object.keys(port), ...Object.keys(template)])].sort();
  for (const key of keys) {
    const a = JSON.stringify(port[key]);
    const b = JSON.stringify(template[key]);
    if (a === b) continue;
    problems.push(
      `\`${key}\` differs: ${portPath} says ${a ?? "nothing"}, ${templatePath} says ${b ?? "nothing"}`,
    );
  }
  return problems;
}

export function quickstartProblems(corpus: QuickstartCorpus): string[] {
  const problems: string[] = [];

  const port = (name: string, text: string): string | null => {
    const list = steps(text);
    if (list === null) problems.push(`the ${name} README carries no delimited quickstart`);
    if (!text.includes(HEADING)) {
      problems.push(`the ${name} README no longer heads its quickstart \`${HEADING}\``);
    }
    return list;
  };
  const ts = port("TypeScript", corpus.tsReadme);
  const kt = port("Kotlin", corpus.ktReadme);

  const checkPaths = (name: string, list: string | null, claims: readonly PathClaim[]): void => {
    if (list === null) return;
    for (const claim of claims) {
      if (!list.includes(claim.named)) {
        problems.push(`the ${name} quickstart no longer names \`${claim.named}\``);
      }
      if (!corpus.present.has(claim.path)) {
        problems.push(`the ${name} quickstart names \`${claim.named}\`, which is not in the tree`);
      }
    }
  };
  checkPaths("TypeScript", ts, TS_PATHS);
  checkPaths("Kotlin", kt, KT_PATHS);

  const checkCommands = (
    name: string,
    list: string | null,
    claims: readonly CommandClaim[],
  ): void => {
    if (list === null) return;
    for (const claim of claims) {
      if (!list.includes(claim.command)) {
        problems.push(`the ${name} quickstart no longer runs \`${claim.command}\``);
      }
      for (const site of claim.sites) {
        const source = corpus.declarations.get(site.declaredIn);
        if (source === undefined || !source.includes(site.token)) {
          problems.push(
            `\`${claim.command}\` is not declared: ${site.declaredIn} no longer holds \`${site.token}\``,
          );
        }
      }
    }
  };
  checkCommands("TypeScript", ts, TS_COMMANDS);
  checkCommands("Kotlin", kt, KT_COMMANDS);

  const checkFacts = (name: string, list: string | null, facts: readonly WalkedFact[]): void => {
    if (list === null) return;
    for (const fact of facts) {
      if (!list.includes(fact.literal)) {
        problems.push(`the ${name} quickstart dropped a walked fact: \`${fact.literal}\``);
      }
      const source = corpus.declarations.get(fact.anchoredIn);
      if (source === undefined || !source.includes(fact.literal)) {
        problems.push(
          `the walked fact \`${fact.literal}\` is no longer anchored in ${fact.anchoredIn}`,
        );
      }
    }
  };
  checkFacts("TypeScript", ts, TS_FACTS);
  checkFacts("Kotlin", kt, KT_FACTS);

  for (const count of corpus.counts) {
    if (count.said < 0) {
      problems.push(`the quickstart no longer states a count for ${count.what}`);
      continue;
    }
    if (count.said !== count.measured) {
      problems.push(
        `the quickstart says ${count.said} for ${count.what}; the tree measures ${count.measured}`,
      );
    }
  }

  // ── THE DEPENDENCY CLOSURE ────────────────────────────────────────────
  // The step list must name every package the COPIED TIER imports, because the
  // adopter's program holds the whole folder. This is the rule that would have
  // caught prose calling `ai` optional: it is optional at run time and
  // mandatory at typecheck, and typecheck is the first command step 6 issues.
  if (ts !== null) {
    const line = MANDATORY_INSTALL.exec(ts);
    if (line === null) {
      problems.push("the TypeScript quickstart carries no mandatory-install line");
    } else {
      const named = new Set(String(line[1]).trim().split(/\s+/));
      for (const external of corpus.spineExternals) {
        if (!named.has(external)) {
          problems.push(
            `the TypeScript quickstart's mandatory install omits \`${external}\`, which the copied spine imports`,
          );
        }
      }
    }
  }

  // ── THE VERB COST, ONE ANSWER PER README ──────────────────────────────
  const costs = (text: string): string[] =>
    [...text.matchAll(VERB_COST)].map(
      (m) => `${m[1]} appends, ${m[2]} files, ${String(m[3]).trim()}`,
    );
  for (const [name, text] of [
    ["TypeScript", corpus.tsReadme],
    ["Kotlin", corpus.ktReadme],
  ] as const) {
    const said = costs(text);
    const distinct = [...new Set(said)];
    if (distinct.length > 1) {
      problems.push(
        `the ${name} README states the verb cost ${said.length === 2 ? "twice" : `${said.length} times`} and they disagree: ${distinct
          .map((s) => `'${s}'`)
          .join(" vs ")}`,
      );
    }
  }

  for (const match of corpus.rootReadme.matchAll(ROOT_VERB_LOCUS)) {
    const line = corpus.rootReadme.slice(0, match.index).split("\n").length;
    problems.push(
      `README.md:${line}  states WHERE a verb's cost lands, which is a port-fact (docs/DECISIONS.md:147)`,
    );
  }

  for (const pointer of ROOT_POINTERS) {
    if (!corpus.rootReadme.includes(pointer)) {
      problems.push(`the root README no longer points at \`${pointer}\``);
    }
  }

  if (!collapse(corpus.rootReadme).includes(collapse(GATE_SPLIT))) {
    problems.push("the root README no longer states how each port's step list is held");
  }

  return problems;
}
