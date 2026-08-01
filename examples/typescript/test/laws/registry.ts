// ── laws.toml, READ AND JUDGED — the gate for the law registry ────────────
//
// `laws.toml` is the one source of truth for the sixteen portable invariants:
// id, invariant name, the layer that actually holds each law, and the checks
// (with their fixture pairs) that do the holding. The book's §15.3 table is
// then ASSERTED against it rather than hand-maintained beside it.
//
// Three deliberate choices, all stated so a reader can attack them:
//
//   · NO TOML LIBRARY. Neither port carries a TOML parser and adding a
//     dependency to read one checked-in file is a poor trade, so `laws.toml` is
//     held to a deliberately trivial grammar — full-line comments, `[[laws]]`
//     and `[[laws.checks]]` headers, `key = "basic string"`, `key = ["a","b"]` —
//     and the reader below is that grammar and nothing else. Anything outside
//     it is a REPORTED problem, never silently skipped: a reader that shrugs at
//     a line it does not understand is a registry that can be edited past.
//
//   · POINTERS ARE RESOLVED, NEVER TRUSTED. A fixture pointer that is only a
//     string has C7's failure mode exactly (a rule whose fixtures no longer
//     stand for the tree, green forever). Every on-disk pointer is resolved and
//     required to be a NON-EMPTY file or directory. THE VALUE-CHECK SHAPE IS
//     HELD TO THE SAME BAR. A check whose block/allow pair is two inputs to one
//     checker has no tree to point at, and the field pair that would have
//     pointed at one was required EMPTY — so the registry proved nothing about
//     it, and the next value check could declare the shape, ship no block-test
//     at all, and pass. An in-checker row therefore NAMES its two test sites,
//     `<path>::<test title>`, and each is RESOLVED: the runner must be willing
//     to open the file, the file must still DECLARE a case under that exact
//     title in live code, that declaration must not be switched off, and the
//     two halves must be two different inputs rather than one named twice.
//
//   · OWNERSHIP IS DERIVED, NEVER DECLARED. Which checks a linter owns is read
//     out of the linter's own source by the caller and passed in as
//     `lintOwned`. A registry that asked THIS FILE whether a check is
//     lint-enforced would be asking the forger: flipping one token would let a
//     live lint rule shed its fixture pair with every gate still green.

/** One BUILD EDGE, at one port, holding one law's module-crossing half.
 *
 *  `token` is the DECLARATION whose deletion removes the refusal — not a label
 *  for the file. That is what makes an edge row resolvable in the same sense a
 *  fixture pointer is: the path must exist and hold something, and the text at
 *  that path must still contain the declaration the row names. A row that is
 *  only a string is the failure mode this file's header already refuses. */
export interface Edge {
  readonly port: string;
  readonly path: string;
  readonly token: string;
}

/** One check, at one port, holding one law. */
export interface Check {
  readonly port: string;
  readonly id: string;
  readonly home: string;
  /** "on-disk" — two trees; "in-checker" — §15.2's two-inputs-to-one-checker shape. */
  readonly pair: string;
  readonly violating: string;
  readonly compliant: string;
  /** An in-checker pair's two halves, each `<path>::<test title>`. Empty on an
   *  on-disk row, where the two halves are the trees above. */
  readonly blockTest: string;
  readonly allowTest: string;
}

/** One law: the public id, the invariant name, and where it is really held. */
export interface Law {
  readonly id: string;
  readonly name: string;
  readonly layers: readonly string[];
  readonly headline: string;
  readonly note: string;
  readonly checks: readonly Check[];
  readonly edges: readonly Edge[];
}

export interface Registry {
  readonly vocabulary: readonly string[];
  readonly laws: readonly Law[];
}

/** A resolved fixture pointer: does it exist, and does it hold anything? */
export type Resolve = (path: string) => "missing" | "empty" | "present";

/** Is this check owned by a linter? Derived by the caller from the linter's
 *  own source — see laws.test.ts. Never read off a token in laws.toml. */
export type LintOwned = (port: string, id: string) => boolean;

/** The two ports the registry covers. A law that names any check must name one
 *  for EVERY port here, or one port's enforcement can be deleted in silence. */
export const PORTS = ["typescript", "kotlin"] as const;

const LAW_KEYS = ["id", "name", "layers", "headline", "note"] as const;
const CHECK_KEYS = [
  "port",
  "id",
  "home",
  "pair",
  "violating",
  "compliant",
  "blockTest",
  "allowTest",
] as const;

/** The separator inside a TEST SITE: the file, then the exact title of the case
 *  in it. Two fields rather than one string with a convention would be two
 *  fields to forget; one field that must SPLIT is a field the reader can check. */
export const SITE = "::";

/** WHICH KEYS A ROW OWES, BY PAIR SHAPE. Two trees name two paths; two inputs to
 *  one checker name two test sites. The base four are owed either way, and a row
 *  whose `pair` is missing or unknown owes only those — `fixtureProblems` is
 *  where an unreadable `pair` is reported, so the two never disagree.
 *
 *  READ WITH `Object.hasOwn`, NEVER A BARE INDEX. `pair` is a string off a
 *  hand-edited file, so `pair = "toString"` would otherwise hand back
 *  `Function.prototype.toString` and crash the whole suite on `.filter` — a
 *  typo turning a REPORT into a dead run. */
const REQUIRED_BY_PAIR: Readonly<Record<string, readonly (typeof CHECK_KEYS)[number][]>> = {
  "on-disk": ["port", "id", "home", "pair", "violating", "compliant"],
  "in-checker": ["port", "id", "home", "pair", "blockTest", "allowTest"],
};
const BASE_KEYS = ["port", "id", "home", "pair"] as const;
const EDGE_KEYS = ["port", "path", "token"] as const;

/** The one layer whose claim is not free. See `shapeProblems` — a law naming it
 *  owes a build edge on EVERY port, and `edgeProblems` resolves each one. */
export const EDGE_LAYER = "configuration-time";

/** The layer vocabulary, and the word in the book's headline that witnesses it.
 *  This is the joint that makes the registry's machine field and the book's
 *  human sentence check each other in BOTH directions. */
const WITNESS: Readonly<Record<string, RegExp>> = {
  /** The module graph's own rung. Witnessed by "build edge" as well as the bare
   *  token because that is the phrase the book's ladder uses for it, and a
   *  headline saying "build edge" while the machine field omits
   *  `configuration-time` is exactly the drift this map exists to catch.
   *  Dry-run over all sixteen shipped headlines: it fires on none of them, the
   *  nearest misses being "one denying edge" and "one denied precondition". */
  [EDGE_LAYER]: /configuration[ -]time|build edge/i,
  "denying-check": /Denying check|denying edge|denied precondition/i,
  behavioral: /behavior/i,
  "compiler-proof": /compiler proof/i,
  discipline: /discipline/i,
  "structural-untested": /Structural by type/i,
};

/** A NOTE that credits a check with holding the law — "one denying check
 *  holds…", "the purity check keeps…", "two checks deny…". The negative form
 *  ("No check denies a deciding surface today", G5) is deliberately excluded:
 *  it is the sentence a law with no check is SUPPOSED to carry. */
export const NOTE_CLAIMS_A_CHECK = /(?<!\bno )\bchecks?\b/i;

/** Homes whose block/allow pair is two inputs to one checker, not two trees. */
const VALUE_HOMES = ["vitest", "junit-reflection"];

function unquote(raw: string): string | null {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return null;
  let out = "";
  for (let i = 1; i < raw.length - 1; i += 1) {
    const ch = raw[i];
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) return null;
      out += next === "n" ? "\n" : next;
      i += 1;
    } else if (ch === '"') {
      return null;
    } else {
      out += ch;
    }
  }
  return out;
}

function parseValue(raw: string): string | readonly string[] | null {
  if (raw.startsWith("[")) {
    if (!raw.endsWith("]")) return null;
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    const parts: string[] = [];
    for (const piece of inner.split(",")) {
      const one = unquote(piece.trim());
      if (one === null) return null;
      parts.push(one);
    }
    return parts;
  }
  return unquote(raw);
}

/** The whole grammar. Every line is a comment, a blank, a header, or a pair. */
export function parseLaws(text: string): { registry: Registry; problems: string[] } {
  const problems: string[] = [];
  const vocabulary: string[] = [];
  const laws: {
    fields: Record<string, string | readonly string[]>;
    checks: Record<string, string>[];
    edges: Record<string, string>[];
  }[] = [];
  let scope: "root" | "law" | "check" | "edge" = "root";

  text.split("\n").forEach((line, index) => {
    const at = `laws.toml:${index + 1}`;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    if (trimmed === "[[laws]]") {
      laws.push({ fields: {}, checks: [], edges: [] });
      scope = "law";
      return;
    }
    if (trimmed === "[[laws.checks]]") {
      const owner = laws[laws.length - 1];
      if (owner === undefined) {
        problems.push(`${at}: [[laws.checks]] before any [[laws]]`);
        return;
      }
      owner.checks.push({});
      scope = "check";
      return;
    }
    if (trimmed === "[[laws.edges]]") {
      const owner = laws[laws.length - 1];
      if (owner === undefined) {
        problems.push(`${at}: [[laws.edges]] before any [[laws]]`);
        return;
      }
      owner.edges.push({});
      scope = "edge";
      return;
    }
    if (trimmed.startsWith("[")) {
      problems.push(`${at}: unknown table header ${trimmed}`);
      return;
    }
    const split = trimmed.indexOf("=");
    if (split < 0) {
      problems.push(`${at}: not a comment, a header, or a key = value pair`);
      return;
    }
    const key = trimmed.slice(0, split).trim();
    const value = parseValue(trimmed.slice(split + 1).trim());
    if (value === null) {
      problems.push(`${at}: ${key} is not a basic string or a string array`);
      return;
    }
    if (scope === "root") {
      if (key !== "vocabulary" || typeof value === "string") {
        problems.push(`${at}: the only top-level key is vocabulary = [...]`);
        return;
      }
      vocabulary.push(...value);
      return;
    }
    const law = laws[laws.length - 1];
    if (law === undefined) return;
    if (scope === "check") {
      const check = law.checks[law.checks.length - 1];
      if (check === undefined) return;
      if (!(CHECK_KEYS as readonly string[]).includes(key) || typeof value !== "string") {
        problems.push(`${at}: ${key} is not one of the check keys ${CHECK_KEYS.join(", ")}`);
        return;
      }
      check[key] = value;
      return;
    }
    if (scope === "edge") {
      const edge = law.edges[law.edges.length - 1];
      if (edge === undefined) return;
      if (!(EDGE_KEYS as readonly string[]).includes(key) || typeof value !== "string") {
        problems.push(`${at}: ${key} is not one of the edge keys ${EDGE_KEYS.join(", ")}`);
        return;
      }
      edge[key] = value;
      return;
    }
    if (!(LAW_KEYS as readonly string[]).includes(key)) {
      problems.push(`${at}: ${key} is not one of the law keys ${LAW_KEYS.join(", ")}`);
      return;
    }
    law.fields[key] = value;
  });

  const built: Law[] = [];
  laws.forEach((law, index) => {
    const id = law.fields.id;
    const where = typeof id === "string" ? id : `[[laws]] #${index + 1}`;
    for (const key of LAW_KEYS) {
      if (law.fields[key] === undefined) problems.push(`${where}: missing ${key}`);
    }
    const checks: Check[] = [];
    for (const check of law.checks) {
      const pair = check.pair ?? "";
      const required = Object.hasOwn(REQUIRED_BY_PAIR, pair)
        ? (REQUIRED_BY_PAIR[pair] as readonly (typeof CHECK_KEYS)[number][])
        : BASE_KEYS;
      const missing = required.filter((key) => check[key] === undefined);
      if (missing.length > 0) {
        problems.push(`${where}: a check is missing ${missing.join(", ")}`);
      }
      checks.push({
        port: check.port ?? "",
        id: check.id ?? "",
        home: check.home ?? "",
        pair: check.pair ?? "",
        violating: check.violating ?? "",
        compliant: check.compliant ?? "",
        blockTest: check.blockTest ?? "",
        allowTest: check.allowTest ?? "",
      });
    }
    const edges: Edge[] = [];
    for (const edge of law.edges) {
      const missing = EDGE_KEYS.filter((key) => edge[key] === undefined);
      if (missing.length > 0)
        problems.push(`${where}: a build edge is missing ${missing.join(", ")}`);
      edges.push({ port: edge.port ?? "", path: edge.path ?? "", token: edge.token ?? "" });
    }
    built.push({
      id: typeof id === "string" ? id : "",
      name: typeof law.fields.name === "string" ? law.fields.name : "",
      layers: Array.isArray(law.fields.layers) ? law.fields.layers : [],
      headline: typeof law.fields.headline === "string" ? law.fields.headline : "",
      note: typeof law.fields.note === "string" ? law.fields.note : "",
      checks,
      edges,
    });
  });

  return { registry: { vocabulary, laws: built }, problems };
}

/** Every row in the registry, flattened. The count is pinned by the test, so a
 *  structural deletion is a visible diff rather than a quiet one. */
export function rows(registry: Registry): readonly { law: string; check: Check }[] {
  return registry.laws.flatMap((law) => law.checks.map((check) => ({ law: law.id, check })));
}

/** (a) every law declares a layer, from the closed vocabulary, the book's
 *  headline says the same thing the machine field says, and THE FLOOR RULE
 *  holds for the one layer whose claim is not free.
 *
 *  THE FLOOR RULE. `layers` is a law-level field printed into ONE fourth-column
 *  cell that speaks for BOTH ports, so a rung may be claimed only where it
 *  holds on EVERY port: a rung one port reaches earlier than the other belongs
 *  in the `note`, never in a headline word and never in `layers`. Before this
 *  rule the token was the one thing in the registry that carried no mechanical
 *  obligation at all — `layers = ["configuration-time"]` with no edge, no
 *  fixture and no evidence passed the whole gate, which is prose wearing a
 *  machine field's clothes. It is checked in BOTH directions: claiming the rung
 *  without a per-port edge is an overclaim, and naming edges without claiming
 *  the rung is a wall the printed cell does not report. */
export function shapeProblems(registry: Registry): string[] {
  const problems: string[] = [];
  const known = new Set(registry.vocabulary);
  if (known.size !== Object.keys(WITNESS).length) {
    problems.push(
      `the vocabulary declares ${known.size} tokens; the checker witnesses ${Object.keys(WITNESS).length}`,
    );
  }
  for (const token of known) {
    if (WITNESS[token] === undefined) problems.push(`vocabulary token "${token}" has no witness`);
  }
  for (const law of registry.laws) {
    if (law.layers.length === 0) {
      problems.push(`${law.id}: no enforcement layer declared — a law with no layer is prose`);
    }
    for (const layer of law.layers) {
      if (!known.has(layer)) problems.push(`${law.id}: layer "${layer}" is outside the vocabulary`);
    }
    for (const [token, witness] of Object.entries(WITNESS)) {
      const inHeadline = witness.test(law.headline);
      const inLayers = law.layers.includes(token);
      if (inHeadline !== inLayers) {
        problems.push(
          `${law.id}: headline ${inHeadline ? "claims" : "omits"} "${token}" but layers ${inLayers ? "claim" : "omit"} it`,
        );
      }
    }
    const edged = new Set(law.edges.map((edge) => edge.port));
    if (law.layers.includes(EDGE_LAYER)) {
      for (const port of PORTS) {
        if (!edged.has(port)) {
          problems.push(
            `${law.id}: layers claim "${EDGE_LAYER}" with no ${port} build edge — the floor is EVERY port, not the strongest one`,
          );
        }
      }
    } else if (law.edges.length > 0) {
      problems.push(
        `${law.id}: names a build edge but layers omit "${EDGE_LAYER}" — the printed cell would not report the wall`,
      );
    }
  }
  return problems;
}

/** COMMENT BODIES, BLANKED — the one spelling both resolvers read through.
 *
 *  A search over raw file text counts a COMMENTED-OUT declaration, which is the
 *  cheapest way there is to disable a wall while leaving its registry row
 *  standing: the deleting author's own `// was: …` note keeps the row green.
 *  `//` and block comments cover both ports — Kotlin and Gradle Kotlin DSL share
 *  TypeScript's comment syntax. The `[^:]` guard is what keeps a `https://` URL
 *  from eating the rest of its line.
 *
 *  LIFTED, NOT RESPELLED. It was inline in `edgeProblems` and the test-site
 *  reader below shipped without it, which is precisely the divergence one
 *  spelling prevents. */
export function liveCode(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** THE EDGE POINTERS ARE RESOLVED, NEVER TRUSTED — the same bar this file's
 *  header sets for fixture pointers, applied to the newest field. Every
 *  `[[laws.edges]]` row must name a port the registry covers, resolve to a
 *  non-empty path, and the text at that path must still contain the token the
 *  row names. The token is the DECLARATION whose deletion removes the refusal,
 *  so deleting the wall and leaving the row behind is red rather than green —
 *  which is the whole difference between an edge that is evidence and an edge
 *  that is a string. */
export function edgeProblems(
  registry: Registry,
  resolve: Resolve,
  readFile: (path: string) => string | null,
): string[] {
  const problems: string[] = [];
  for (const law of registry.laws) {
    for (const edge of law.edges) {
      const at = `${law.id}/${edge.port}`;
      if (!(PORTS as readonly string[]).includes(edge.port)) {
        problems.push(`${at}: "${edge.port}" is not one of the registry's ports`);
        continue;
      }
      if (edge.path === "" || edge.token === "") {
        problems.push(`${at}: a build edge names both a path and the declaration that draws it`);
        continue;
      }
      const state = resolve(edge.path);
      if (state !== "present") {
        problems.push(`${at}: build edge ${edge.path} is ${state}`);
        continue;
      }
      const text = readFile(edge.path);
      if (text === null) {
        problems.push(`${at}: build edge ${edge.path} could not be read`);
        continue;
      }
      // LIVE CODE ONLY — see `liveCode`, which this reader and the TEST-SITE
      // reader now share. One spelling, so hardening one cannot leave the other
      // behind: the edge reader learned this from an adversarial reviewer who
      // commented out the five lines that draw the edge, and the site reader
      // shipped with the identical hole ninety lines below.
      const live = liveCode(text);
      if (!live.includes(edge.token)) {
        problems.push(
          `${at}: build edge ${edge.path} no longer declares "${edge.token}" in live code` +
            ` (a commented-out declaration draws no edge)`,
        );
      }
    }
  }
  return problems;
}

/** (e) THE NOTE IS EVIDENCE TOO. The headline is a four-word summary; every
 *  attribution of a check lives in the note. A law whose note credits a check
 *  with holding it must name one — otherwise a law can carry the headline
 *  "Behavioral." and shed its whole fixture-pair record while the book cell it
 *  regenerates still says a check holds it. ONE-DIRECTIONAL by design: a note
 *  may legitimately not mention a check that exists. */
export function attributionProblems(registry: Registry): string[] {
  const problems: string[] = [];
  for (const law of registry.laws) {
    if (NOTE_CLAIMS_A_CHECK.test(law.note) && law.checks.length === 0) {
      problems.push(`${law.id}: the note claims a denying check and the law names none`);
    }
  }
  return problems;
}

/** (f) THE BINDING IS DERIVED TOO. A checker's own `invariant` text states
 *  which G-law it holds; a law→check binding laws.toml invents is a binding no
 *  source agrees with — adversarial review permuted G13↔G14's check rows and
 *  every shipped assertion stayed green, because nothing compared the binding
 *  against the checkers. One-directional on purpose: a check may hold a law
 *  its text does not name (C6/C12/C13 cite sections only), but every G-id a
 *  check DOES name must be a law that names that check, on that port. */
export function bindingProblems(
  registry: Registry,
  declared: ReadonlyMap<string, ReadonlySet<string>>,
  port: string,
): string[] {
  const held = new Map<string, Set<string>>();
  for (const { law, check } of rows(registry)) {
    if (check.port !== port) continue;
    const bound = held.get(check.id) ?? new Set<string>();
    bound.add(law);
    held.set(check.id, bound);
  }
  const problems: string[] = [];
  for (const [id, gids] of declared) {
    for (const gid of gids) {
      if (!held.get(id)?.has(gid)) {
        problems.push(
          `${port} ${id} declares it holds ${gid}, but laws.toml does not bind ${gid} to ${id} on ${port}`,
        );
      }
    }
  }
  return problems;
}

// ── RESOLVING A TEST SITE ─────────────────────────────────────────────────
//
// A SUBSTRING SEARCH IS NOT RESOLUTION, and the first cut of this reader was
// one. Asking whether `"title"` occurs anywhere in a file accepts a case that
// was DELETED (the quoting comment survives it), a case that was SWITCHED OFF,
// and a title sitting in any role at all — an `expect(...).toContain(...)`
// argument reads exactly like a declaration to it. It also REJECTS a live case
// whose title carries a double quote, because biome's `quoteStyle: "double"`
// formats that declaration single-quoted and a two-spelling search does not
// know the third. Too weak against every attack and too strict against a real
// title, from the same mistake.
//
// So a site is resolved by matching a DECLARATION POSITION, over `liveCode`
// only, keyed on `check.home` — the joint `VALUE_HOMES` already uses. Not on
// port and not on path: the home is what says which runner would open the file
// and what a case looks like to it.

/** What the file says about a title. `absent` — no declaration at all;
 *  `no-test` — declared, but the annotation that makes it a case is missing;
 *  `off` — declared and switched off; `live` — declared and it will run. */
type Declaration = "absent" | "no-test" | "off" | "live";

/** Modifier-chain segments that switch a vitest case or suite off. `only` is
 *  deliberately absent: it runs. */
const SWITCHED_OFF = ["skip", "todo", "fails"];

/** A title, escaped for use inside a matcher. Titles are prose off a checked-in
 *  file and carry `(`, `.`, `+` and `?` freely. */
const escapeTitle = (title: string): string => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const chainOff = (chain: string): boolean =>
  chain
    .split(".")
    .filter((seg) => seg !== "")
    .some((seg) => SWITCHED_OFF.includes(seg));

/** Is the case at `at` sitting under a suite that is switched off?
 *
 *  DOCUMENTED HEURISTIC, stated rather than hidden: this reads the NEAREST
 *  `describe(` opener before the match and asks whether that one is disabled.
 *  It does not track nesting or closing braces, so a CLOSED sibling
 *  `describe.skip(...)` earlier in the same file would be read as enclosing and
 *  report a live case. That direction is a false RED with an obvious fix, never
 *  a silent green, and the compliant fixture ships a case under an ordinary
 *  `describe` so the ordinary shape is proven not to trip it. */
function suiteOff(text: string, at: number): boolean {
  let off = false;
  for (const m of text.matchAll(/\b(x?)describe((?:\.\w+)*)\s*\(/g)) {
    if ((m.index ?? 0) >= at) break;
    off = m[1] === "x" || chainOff(String(m[2]));
  }
  return off;
}

/** `it`/`test`, with every prefix and modifier a runner understands, and ALL
 *  THREE quote characters — which is what dissolves the quote-bearing false
 *  positive by construction rather than by a second spelling. */
function vitestDeclares(text: string, title: string): Declaration {
  const decl = new RegExp(
    `\\b(x?)(?:it|test)((?:\\.\\w+)*)\\s*\\(\\s*(['"\`])${escapeTitle(title)}\\3`,
    "g",
  );
  let seen: Declaration = "absent";
  for (const m of text.matchAll(decl)) {
    if (m[1] !== "x" && !chainOff(String(m[2])) && !suiteOff(text, m.index ?? 0)) return "live";
    seen = "off";
  }
  return seen;
}

/** A JUnit case is a BACKTICKED function carrying `@Test`. Liveness is proven by
 *  ANNOTATION, never by path — deliberately, so a fixture tree that is not laid
 *  out like a source tree still resolves. The annotation run is the block of
 *  `@`-prefixed lines immediately above the `fun` line, which is where Kotlin
 *  puts them. */
function junitDeclares(text: string, title: string): Declaration {
  const decl = new RegExp(`fun\\s+\`${escapeTitle(title)}\`\\s*\\(`, "g");
  let seen: Declaration = "absent";
  for (const m of text.matchAll(decl)) {
    const before = text.slice(0, m.index ?? 0).split("\n");
    before.pop();
    const run: string[] = [];
    for (let i = before.length - 1; i >= 0; i -= 1) {
      const line = String(before[i]).trim();
      if (!line.startsWith("@")) break;
      run.push(line);
    }
    if (!run.some((line) => /^@Test\b/.test(line))) {
      seen = seen === "absent" ? "no-test" : seen;
      continue;
    }
    if (run.some((line) => /^@(?:Ignore|Disabled)\b/.test(line))) {
      seen = "off";
      continue;
    }
    return "live";
  }
  return seen;
}

/** vitest's exclude list, RESTATED FROM `examples/typescript/vitest.config.ts`
 *  because that option REPLACES vitest's default rather than extending it — so
 *  the config is the only honest source and laws.test.ts asserts this array
 *  against the live file rather than trusting the copy.
 *
 *  Read as a path SEGMENT anywhere, even for the root-anchored entries: the
 *  registry names REPO-relative paths while the config is rooted at the port,
 *  so a segment read is the only one that lines the two up. It denies strictly
 *  more than vitest skips, which is the safe direction for a check whose whole
 *  job is refusing a block-test the runner would never open. */
export const VITEST_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  ".tsbuild/**",
  ".work/**",
] as const;

const VITEST_INCLUDE = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/;

function vitestRuns(path: string): boolean {
  if (!VITEST_INCLUDE.test(path)) return false;
  const segments = path.split("/");
  return !VITEST_EXCLUDE.some((glob) =>
    segments.includes(glob.replace(/^\*\*\//, "").replace(/\/\*\*$/, "")),
  );
}

/** ONE HALF OF AN IN-CHECKER PAIR, RESOLVED. The site is `<path>::<test title>`,
 *  and every part of that is load-bearing: the runner must be willing to open
 *  the file, the file must exist and hold something, and it must still declare a
 *  LIVE case under that exact title. */
function siteProblems(
  at: string,
  half: string,
  home: string,
  site: string,
  resolve: Resolve,
  readFile: (path: string) => string | null,
): string[] {
  if (site === "") {
    return [
      `${at}: the ${half} half of an in-checker pair names no test site — a pair carried` +
        ` inside a checker still names its two inputs`,
    ];
  }
  const cut = site.indexOf(SITE);
  if (cut < 0) return [`${at}: ${half} site "${site}" is not <path>${SITE}<test title>`];
  const path = site.slice(0, cut);
  const title = site.slice(cut + SITE.length);
  if (path === "" || title === "") {
    return [`${at}: ${half} site "${site}" names ${path === "" ? "no file" : "no test title"}`];
  }
  if (home === "vitest" && !vitestRuns(path)) {
    return [`${at}: ${half} ${path} is not a file vitest executes`];
  }
  const state = resolve(path);
  if (state !== "present") return [`${at}: ${half} file ${path} is ${state}`];
  const text = readFile(path);
  if (text === null) return [`${at}: ${half} file ${path} could not be read`];
  const live = liveCode(text);
  const found =
    home === "junit-reflection" ? junitDeclares(live, title) : vitestDeclares(live, title);
  if (found === "live") return [];
  if (found === "off") {
    return [
      `${at}: ${half} ${path} declares "${title}" SWITCHED OFF — a disabled case denies nothing`,
    ];
  }
  if (found === "no-test") return [`${at}: ${half} ${path} declares no @Test on "${title}"`];
  return [`${at}: ${half} ${path} declares no case titled "${title}"`];
}

/** A PAIR IS TWO THINGS. One input named twice is a row DECLARING that the check
 *  ships one half, spelled so it reads like two — and it passed both branches.
 *  ONE helper for both shapes on purpose: the in-checker branch being stricter
 *  than the on-disk one would falsify this module's own claim that the value
 *  shape is held to the same bar. */
function twiceProblems(
  at: string,
  kind: "in-checker" | "on-disk",
  first: string,
  second: string,
): string[] {
  if (first === "" || first !== second) return [];
  return [
    `${at}: an ${kind} pair's two halves are two DIFFERENT` +
      ` ${kind === "in-checker" ? "inputs" : "trees"}, not "${first}" named twice`,
  ];
}

/** (b) a law held by a denying check names one, every pointer RESOLVES — the
 *  on-disk trees AND the in-checker test sites — and no LINT-OWNED check claims
 *  the value-check pair shape.
 *
 *  THE HOLE THIS FIELD PAIR CLOSED, stated so it does not reopen. The in-checker
 *  branch used to REQUIRE `violating` and `compliant` empty and demand nothing in
 *  their place, so a value check could declare `home = "vitest"`, `pair =
 *  "in-checker"` and ship no block-test whatsoever, and this function would
 *  report nothing. §15.2's bar reads "every check ships a paired block-test and
 *  allow-test"; the shape difference it lists is where the pair LIVES, never
 *  whether there is one. So the two halves are still refused a tree, and are now
 *  owed two named, resolved, DISTINCT test sites instead. */
export function fixtureProblems(
  registry: Registry,
  resolve: Resolve,
  lintOwned: LintOwned,
  readFile: (path: string) => string | null,
): string[] {
  const problems: string[] = [];
  for (const law of registry.laws) {
    if (law.layers.includes("denying-check") && law.checks.length === 0) {
      problems.push(`${law.id}: layer "denying-check" but no check named`);
    }
    for (const check of law.checks) {
      const at = `${law.id}/${check.id}/${check.port}`;
      if (check.pair === "in-checker") {
        if (lintOwned(check.port, check.id)) {
          problems.push(`${at}: a lint-owned check may not claim an in-checker pair`);
        }
        if (!VALUE_HOMES.includes(check.home)) {
          problems.push(`${at}: only ${VALUE_HOMES.join(" or ")} may claim an in-checker pair`);
        }
        if (check.violating !== "" || check.compliant !== "") {
          problems.push(`${at}: an in-checker pair names no path`);
        }
        problems.push(...twiceProblems(at, "in-checker", check.blockTest, check.allowTest));
        for (const [half, site] of [
          ["block-test", check.blockTest],
          ["allow-test", check.allowTest],
        ] as const) {
          problems.push(...siteProblems(at, half, check.home, site, resolve, readFile));
        }
        continue;
      }
      if (check.pair !== "on-disk") {
        problems.push(`${at}: pair must be "on-disk" or "in-checker", not "${check.pair}"`);
        continue;
      }
      // The mirror of the line above, and not decoration: a row that names BOTH
      // shapes is a row whose pair nobody can say they read, and the on-disk
      // half would be the one silently unresolved.
      if (check.blockTest !== "" || check.allowTest !== "") {
        problems.push(`${at}: an on-disk pair names two trees, not a test site`);
      }
      problems.push(...twiceProblems(at, "on-disk", check.violating, check.compliant));
      for (const [half, path] of [
        ["violating", check.violating],
        ["compliant", check.compliant],
      ] as const) {
        if (path === "") {
          problems.push(`${at}: the ${half} half of an on-disk pair names no path`);
          continue;
        }
        const state = resolve(path);
        if (state !== "present") problems.push(`${at}: ${half} fixture ${path} is ${state}`);
      }
    }
  }
  return problems;
}

/** The book's §15.3 row, whole: id, invariant name, guarantee, enforcement
 *  layer. Exported so a test can census the live book with the SAME regex the
 *  reader below matches on, rather than a second spelling of it. */
export const FOUR_CELL_ROW =
  /<tr><td class="r">(G\d+)<\/td><td>([a-z-]+)<\/td><td>.*?<\/td><td>(<strong>.*?)<\/td><\/tr>/g;

/** Any row carrying an enforcement-layer cell — at ANY position, with ANY
 *  first-cell attributes. Adversarial review defeated the second-cell,
 *  `class="r"`-keyed spelling twice: once by deleting the attribute (the
 *  book's majority spelling is a plain `<td>`), once by inserting a filler
 *  cell so the layer sat third. A layer cell is recognized by its FORM — a
 *  `<strong>` opening with one of the vocabulary's headline words — so the
 *  census counts rows that state a layer ANYWHERE, and the caller asserts the
 *  count EQUALS the sixteen legitimate law rows rather than zero. */
export const LAYER_ANYWHERE_IN_A_ROW =
  /<tr>(?:(?!<\/tr>)[\s\S])*?<td[^>]*><strong>(?:Configuration|Denying|Behavioral|Discipline|Impossible|Structural|Compiler)[\s\S]*?<\/tr>/g;

/** The fourth column's header. Deleting it leaves a three-header table over
 *  four-cell rows, which no row-level read can see. */
export const FOURTH_HEADER = "<th>Held today by</th>";

/** (c) the registry IS the book's §15.3 table — ids, order, names, and the
 *  enforcement cell reconstructed from `headline` + `note`, byte for byte.
 *
 *  ONE ROW, FOUR CELLS, MATCHED TOGETHER. §15's inversion put the enforcement
 *  layer INTO each law's own row, replacing the separate map that stated the
 *  same subject twice. Reading id, name, guarantee and layer out of a single
 *  `<tr>` is what makes that structural — but a four-cell read ALONE is happy
 *  with a book that also carries a second layer table beside it, which is the
 *  precise thing the inversion removed. Both keyings of that duplicate were
 *  built and measured, so three censuses ride along:
 *
 *    · every `class="r"` G-id cell in the whole book is one of the sixteen.
 *      Catches the G-id-keyed duplicate, whose census is 32.
 *    · NO row anywhere states a layer in its SECOND cell. This is the
 *      load-bearing one: it catches BOTH duplicates, including the
 *      name-keyed one, which leaves the G-id census sitting at sixteen and is
 *      therefore invisible to the census above.
 *    · the fourth column keeps its header, otherwise deletable in silence.
 *
 *  RESIDUAL, STATED RATHER THAN PAPERED OVER: the `.*?` in the row read
 *  assumes no guarantee cell ever contains the literal `</td><td><strong>`.
 *  (The three-cell and attribute-stripped restatements are closed: the layer
 *  census is form-keyed, position-agnostic, and pinned to an equality.) */
export function bookProblems(registry: Registry, book: string): string[] {
  const problems: string[] = [];
  const rows = [...book.matchAll(FOUR_CELL_ROW)];
  if (rows.length !== registry.laws.length) {
    problems.push(
      `the book's invariant table has ${rows.length} four-cell rows, laws.toml has ${registry.laws.length}`,
    );
  }
  const ids = [...book.matchAll(/<td class="r">G\d+<\/td>/g)].length;
  if (ids !== registry.laws.length) {
    problems.push(
      `the book states a law id in ${ids} cells, laws.toml has ${registry.laws.length}`,
    );
  }
  const layerRows = [...book.matchAll(LAYER_ANYWHERE_IN_A_ROW)].length;
  if (layerRows !== registry.laws.length) {
    problems.push(
      `${layerRows} rows state an enforcement layer, laws.toml has ${registry.laws.length} — a surplus row states an enforcement layer in a row of its own, and the layer rides the law's own row only`,
    );
  }
  const headers = book.split(FOURTH_HEADER).length - 1;
  if (headers !== 1) {
    problems.push(
      `the invariant table's fourth column header ${FOURTH_HEADER} appears ${headers} times, not once`,
    );
  }
  registry.laws.forEach((law, index) => {
    const row = rows[index];
    if (row === undefined || row[1] !== law.id || row[2] !== law.name) {
      problems.push(
        `invariant table row ${index + 1} is ${row?.[1]}/${row?.[2]}, laws.toml says ${law.id}/${law.name}`,
      );
      return;
    }
    const expected = `<strong>${law.headline}</strong> ${law.note}`;
    if (row[3] !== expected) {
      problems.push(`${law.id}: the enforcement cell does not regenerate from laws.toml`);
    }
  });
  return problems;
}

/** (d) every check on each port's own roster traces to at least one law, the
 *  registry agrees with that roster about where the check lives, and a law that
 *  names any check names one for EVERY port.
 *
 *  MULTIPLICITY MATTERS. Four ids (C1, C7, C8, C15) hold two laws each, so a
 *  set keyed on the check id alone collapses the two occurrences: either one
 *  could be deleted and the other would still answer for it. Every guard below
 *  is therefore keyed per (law, port, id) or asserted per law. */
export function rosterProblems(
  registry: Registry,
  rosters: Readonly<Record<string, ReadonlyMap<string, string>>>,
): string[] {
  const problems: string[] = [];

  for (const law of registry.laws) {
    if (law.checks.length === 0) continue;
    for (const port of PORTS) {
      if (!law.checks.some((check) => check.port === port)) {
        problems.push(`${law.id}/${port}: the law names checks but none on this port`);
      }
    }
    for (const check of law.checks) {
      const roster = rosters[check.port];
      if (roster === undefined) continue;
      const home = roster.get(check.id);
      if (home === undefined) {
        problems.push(
          `${law.id}: ${check.port}/${check.id} is named by laws.toml, absent from the roster`,
        );
      } else if (home !== check.home) {
        problems.push(
          `${law.id}: the ${check.port} roster says "${home}" for ${check.id}, laws.toml says "${check.home}"`,
        );
      }
    }
  }

  for (const [port, roster] of Object.entries(rosters)) {
    if (roster.size === 0) {
      problems.push(`${port}: the roster parsed EMPTY — the anchor it keys on has moved`);
    }
    const traced = new Set(
      registry.laws.flatMap((law) =>
        law.checks.filter((check) => check.port === port).map((check) => check.id),
      ),
    );
    for (const id of roster.keys()) {
      if (!traced.has(id))
        problems.push(`${port}/${id}: on the roster, traced to no law in laws.toml`);
    }
  }
  return problems;
}
