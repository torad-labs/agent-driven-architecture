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
//     required to be a NON-EMPTY file or directory.
//
//   · OWNERSHIP IS DERIVED, NEVER DECLARED. Which checks a linter owns is read
//     out of the linter's own source by the caller and passed in as
//     `lintOwned`. A registry that asked THIS FILE whether a check is
//     lint-enforced would be asking the forger: flipping one token would let a
//     live lint rule shed its fixture pair with every gate still green.

/** One check, at one port, holding one law. */
export interface Check {
  readonly port: string;
  readonly id: string;
  readonly home: string;
  /** "on-disk" — two trees; "in-checker" — §15.2's two-inputs-to-one-checker shape. */
  readonly pair: string;
  readonly violating: string;
  readonly compliant: string;
}

/** One law: the public id, the invariant name, and where it is really held. */
export interface Law {
  readonly id: string;
  readonly name: string;
  readonly layers: readonly string[];
  readonly headline: string;
  readonly note: string;
  readonly checks: readonly Check[];
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
const CHECK_KEYS = ["port", "id", "home", "pair", "violating", "compliant"] as const;

/** The layer vocabulary, and the word in the book's headline that witnesses it.
 *  This is the joint that makes the registry's machine field and the book's
 *  human sentence check each other in BOTH directions. */
const WITNESS: Readonly<Record<string, RegExp>> = {
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
  }[] = [];
  let scope: "root" | "law" | "check" = "root";

  text.split("\n").forEach((line, index) => {
    const at = `laws.toml:${index + 1}`;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    if (trimmed === "[[laws]]") {
      laws.push({ fields: {}, checks: [] });
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
      const missing = CHECK_KEYS.filter((key) => check[key] === undefined);
      if (missing.length > 0 && !(missing.length === 2 && check.pair === "in-checker")) {
        problems.push(`${where}: a check is missing ${missing.join(", ")}`);
      }
      checks.push({
        port: check.port ?? "",
        id: check.id ?? "",
        home: check.home ?? "",
        pair: check.pair ?? "",
        violating: check.violating ?? "",
        compliant: check.compliant ?? "",
      });
    }
    built.push({
      id: typeof id === "string" ? id : "",
      name: typeof law.fields.name === "string" ? law.fields.name : "",
      layers: Array.isArray(law.fields.layers) ? law.fields.layers : [],
      headline: typeof law.fields.headline === "string" ? law.fields.headline : "",
      note: typeof law.fields.note === "string" ? law.fields.note : "",
      checks,
    });
  });

  return { registry: { vocabulary, laws: built }, problems };
}

/** Every row in the registry, flattened. The count is pinned by the test, so a
 *  structural deletion is a visible diff rather than a quiet one. */
export function rows(registry: Registry): readonly { law: string; check: Check }[] {
  return registry.laws.flatMap((law) => law.checks.map((check) => ({ law: law.id, check })));
}

/** (a) every law declares a layer, from the closed vocabulary, and the book's
 *  headline says the same thing the machine field says. */
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

/** (b) a law held by a denying check names one, every pointer RESOLVES, and no
 *  LINT-OWNED check claims the value-check pair shape. */
export function fixtureProblems(
  registry: Registry,
  resolve: Resolve,
  lintOwned: LintOwned,
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
        continue;
      }
      if (check.pair !== "on-disk") {
        problems.push(`${at}: pair must be "on-disk" or "in-checker", not "${check.pair}"`);
        continue;
      }
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
  /<tr>(?:(?!<\/tr>)[\s\S])*?<td[^>]*><strong>(?:Denying|Behavioral|Discipline|Impossible|Structural|Compiler)[\s\S]*?<\/tr>/g;

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
