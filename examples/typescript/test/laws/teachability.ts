// ── THE TEACHABILITY CENSUS — G13's test, made countable ──────────────────
//
// G13's governing question is a trial, not a rule: hand a fresh author — a new
// teammate, or an independent agent — one block's contract and nothing else, and
// see whether they can produce a conforming implementation without opening a
// sibling's source. A trial cannot be a lint. What CAN be mechanised is the
// trial's PRECONDITION and its RECEIPT, and this module is both:
//
//   · THE PRECONDITION. A fresh author can only be handed what a DECLARED
//     contract requires. So the census reads each block's one public symbol and
//     asks, per member, whether some declared contract requires it. A member the
//     root needs and no contract names is a member the author learns by reading
//     a sibling — which is verbatim the failure G13's test is looking for.
//   · THE RECEIPT. The CHANGELOG entry for the live marker must state what this
//     census measured, in the census's own numbers, AND the verdict those
//     numbers support. The trial stays human; the claim about it cannot drift
//     from the tree in either direction.
//
// WHAT "A DECLARED CONTRACT REQUIRES" MEANS, PER PORT, AND WHY THEY DIFFER.
// Kotlin's marker is exact: `override` cannot be written for a member no
// supertype declares, and cannot be omitted for one that is, so the keyword IS
// the compiler's own answer. TypeScript has no such marker today because it has
// no block-facade contract at all — every facade is a bare object literal. That
// asymmetry is the finding, not a gap in the reader.
//
// THE READER IS FAIL-CLOSED WHERE IT IS APPROXIMATE, and the shape of that is
// worth stating rather than trusting:
//
//   · A TypeScript facade wrapped in a call — `Object.freeze({…})`,
//     `defineBlock({…})` — does not match `TS_FACADE` at all, so the facade
//     reads null and `teachabilityProblems` reports "no block facade found".
//     MEASURED, both spellings. That is why this module does NOT enumerate
//     wrapper spellings: the unenumerated one is already a red build, and a
//     list of spellings is a list the next landing walks around.
//   · A member whose key the reader cannot NAME — a computed key, a spread, an
//     identifier not followed by a key terminator — is pushed as `UNREADABLE`
//     and reported. It is never dropped, because a silently shorter member list
//     is a silently better score.
//   · The moment a TypeScript facade DOES declare a contract, this module
//     reports a problem rather than crediting the whole surface: "a contract
//     exists" and "this contract requires that member" are different claims and
//     only the second one is teachability.
//
//   The one residue, recorded rather than closed: a contract asserted in a
//   DIFFERENT file (`const _check: BlockFacade = escalation;`) is invisible
//   here. It errs toward reporting the tree LESS teachable than it is, which is
//   the safe direction for a metric whose job is to refuse softening.
//
// IT IS DELIBERATELY NOT A NEW LAW. The invariant registry is closed at sixteen
// and §16.4's bar for reopening it — a named production failure — is not met by
// a measurement. It is a gated test wired into `npm test`, exactly like the
// release check next to it, which is the precedent it copies. What it DOES amend
// is the registry's account of G13: the ordering-and-teachability half is held by
// discipline, G13's own note has always said so, and after this the `layers`
// field says so too.

import { entries } from "./release";

/** The two ports the census covers, and the label the CHANGELOG spells. */
export const PORTS = ["typescript", "kotlin"] as const;
export type Port = (typeof PORTS)[number];
export const PORT_LABEL: Readonly<Record<Port, string>> = {
  typescript: "TypeScript",
  kotlin: "Kotlin",
};

/** A surface member the reader could not name — a computed key, a spread, an
 *  identifier that is not a key at all. The census refuses to guess: an
 *  unenumerable surface is reported, never dropped, because a silently shorter
 *  member list is a silently better score. */
export const UNREADABLE = "<unreadable>";

/** The heading the receipt is written under, in the CHANGELOG entry for the live
 *  marker. A fixed spelling for the same reason the migration note has one: a
 *  check has to be able to find it, and an author has to be able to write it. */
export const RECEIPT_HEADING = "**Teachability:**";

/** The two verdicts the receipt may state, and the census decides which. A
 *  finding is a number AND a reading of it, and the reading is the half a
 *  release is tempted to soften — the numbers are tedious to fake and the
 *  sentence beside them is free. So the sentence is derived too: while any port
 *  publishes a universal member no contract requires, the receipt owes the
 *  DEFICIT wording and is refused the SUFFICIENT one, and the day that set
 *  empties the obligation flips. Neither spelling can be written over a tree
 *  that does not support it. */
export const VERDICT_DEFICIT = "*not* yet sufficient";
export const VERDICT_SUFFICIENT = "sufficient in both ports";

/** The two things the release ritual owes this census. The first is the
 *  OWNER-AND-TRIGGER claim — teachability runs per release, never on a schedule
 *  nobody owns. The second is the RUNNABLE claim: a ritual that names no module
 *  is asking for a judgement call, and this file is the module. Deleting either
 *  is a red build rather than a quiet return to prose. */
export const RITUAL_OBLIGATIONS = [
  "The teachability test is run here, not on a schedule.",
  "examples/typescript/test/laws/teachability.ts",
] as const;

/** The two things the CHANGELOG's own PREAMBLE owes, and this is the half a
 *  check is easy to forget to build. The ritual document tells an author to run
 *  the census; the CHANGELOG is the document that author is looking at while
 *  writing the entry, and until it names the obligation, an entry authored
 *  strictly from it is red on a rule stated nowhere the author read. So the
 *  preamble must name the heading it now requires, and the second machine that
 *  reads this file beside `release.ts`. */
export const CHANGELOG_OBLIGATIONS = [
  "**Teachability:**",
  "examples/typescript/test/laws/teachability.ts",
] as const;

/** One block's one public symbol, per port. */
export interface BlockSource {
  readonly port: Port;
  readonly block: string;
  /** repo-relative, for the problem sentences */
  readonly path: string;
  readonly source: string;
}

export interface Member {
  readonly name: string;
  /** Required by a declared contract — so learnable without a sibling. */
  readonly pinned: boolean;
}

export interface Facade {
  readonly port: Port;
  readonly block: string;
  readonly path: string;
  /** The public symbol's own name — discovered, never enumerated. */
  readonly symbol: string;
  /** The declared contract, or null when the surface answers to none. */
  readonly contract: string | null;
  readonly members: readonly Member[];
}

export interface PortCensus {
  readonly facades: number;
  readonly members: number;
  readonly pinned: number;
  /** Members every facade of the port publishes — the port's real block shape. */
  readonly universal: readonly string[];
  /** Universal members no declared contract requires everywhere. This is the
   *  answer to "what would an implementer still have to infer". */
  readonly unpinnedUniversal: readonly string[];
}

export interface TeachabilityCorpus {
  readonly sources: readonly BlockSource[];
  /** `RELEASE-RITUAL.md`, verbatim. */
  readonly ritual: string;
  /** `CHANGELOG.md`, verbatim. */
  readonly changelog: string;
}

// ── THE SHARED SCANNER ─────────────────────────────────────────────────────

/**
 * How one language spells a string, so the walker below can skip one without
 * desynchronising. This is a DIALECT rather than a list of quote characters
 * because the two ports disagree on all three axes and every disagreement is a
 * way to lose members silently:
 *
 *   · TypeScript's backtick string carries `${…}` interpolation holes, and a
 *     hole may contain a backtick. A walker that stops at the first backtick
 *     inside the hole reads the rest of the literal as CODE and the code after
 *     it as string — and the members it then drops make the port look MORE
 *     teachable, which is the direction this module refuses.
 *   · Kotlin's holes ride the ordinary double-quoted string, and its backtick
 *     is not a string at all: it quotes an IDENTIFIER (``fun `arm`()``).
 *     Treating it as a string swallows the declaration after it.
 *   · Kotlin's `"""` raw string opens with what looks like an empty string
 *     followed by another quote.
 *
 * Both dialects are pinned as literals by teachability.test.ts, so a port that
 * quietly acquires the other's spelling is a visible diff.
 */
export interface Dialect {
  /** Characters that open a string literal. */
  readonly quotes: readonly string[];
  /** Of those, the ones whose strings carry `${…}` interpolation holes. */
  readonly holes: readonly string[];
  /** The raw-string fence, or null where the language has none. */
  readonly raw: string | null;
}

export const TS_DIALECT: Dialect = { quotes: ['"', "'", "`"], holes: ["`"], raw: null };
export const KT_DIALECT: Dialect = { quotes: ['"', "'"], holes: ['"'], raw: '"""' };

/** Past the string that opens at `at`. Mutually recursive with `skipHole`,
 *  which is the whole point: a hole is code, and code can open a string. */
function skipString(source: string, at: number, dialect: Dialect): number {
  const quote = source[at] ?? "";
  if (dialect.raw !== null && source.startsWith(dialect.raw, at)) {
    const end = source.indexOf(dialect.raw, at + dialect.raw.length);
    return end < 0 ? source.length : end + dialect.raw.length;
  }
  const interpolated = dialect.holes.includes(quote);
  let i = at + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (interpolated && source[i] === "$" && source[i + 1] === "{") {
      i = skipHole(source, i + 2, dialect);
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Past the `}` closing an interpolation hole that opened at `at`. */
function skipHole(source: string, at: number, dialect: Dialect): number {
  let i = at;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const char = source[i] ?? "";
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (dialect.quotes.includes(char)) {
      i = skipString(source, i, dialect);
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    i += 1;
  }
  return i;
}

/**
 * Walk a brace- or paren-delimited body from `start`, skipping comments and
 * string literals, and hand each depth-one position to `onTop`. ONE walker, TWO
 * readers — a nesting or quoting bug cannot show up in one port's numbers and
 * not the other's, which is the whole reason the ports share it. `onTop` returns
 * the index to resume from, or null to advance one character. The return value
 * is the index just past the closer that brought depth to zero, so a caller can
 * read what follows the region it just walked.
 */
export function walkBody(
  source: string,
  start: number,
  dialect: Dialect,
  onTop: (char: string, at: number) => number | null,
): number {
  let i = start;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    const char = source[i] ?? "";
    if (dialect.quotes.includes(char)) {
      i = skipString(source, i, dialect);
      continue;
    }
    // THE READER SEES A BRACKET BEFORE THE WALKER DOES, and that ordering is
    // load-bearing rather than incidental: a computed key OPENS a bracket, so a
    // walker that consumed `[` as structure first would hand the reader nothing
    // to report and the member would vanish silently. The reader gets every
    // depth-one character, brackets included, and returning null hands it back.
    if (depth === 1) {
      const jump = onTop(char, i);
      if (jump !== null) {
        i = jump;
        continue;
      }
    }
    if (char === "{" || char === "(" || char === "[") {
      depth += 1;
      i += 1;
      if (depth === 2) onTop("<open>", i);
      continue;
    }
    if (char === "}" || char === ")" || char === "]") {
      depth -= 1;
      i += 1;
      if (depth === 1) onTop("<close>", i);
      continue;
    }
    i += 1;
  }
  return i;
}

// ── THE TWO READERS ────────────────────────────────────────────────────────

/** The TypeScript facade's opening: `export const <symbol>[: <contract>] = {`. */
export const TS_FACADE = /^export const ([A-Za-z_$][\w$]*)(\s*:\s*[^=]+?)?\s*=\s*\{/m;
/** A `satisfies` clause on the closing line — the OTHER way a TypeScript object
 *  literal can answer to a contract, and the one an author reaches for first. */
export const TS_SATISFIES = /^[^;\n]*\bsatisfies\s+([A-Za-z_$][\w$]*)/;
/** What may FOLLOW a key at the facade's top level, and nothing else may. The
 *  four spellings are `key: value`, shorthand `key,`, shorthand at the end
 *  `key}` and method shorthand `key(`. This is the terminator rule that keeps
 *  the reader from inventing members out of TYPE arguments: `ArmOut<A, B>` puts
 *  a comma at brace depth one, which returns the walker to key position, and
 *  `B` then reads as an identifier followed by `>`. Requiring a terminator makes
 *  that UNREADABLE — reported, fail-closed — instead of a member named after a
 *  type, and it does so without teaching the walker angle brackets, which are
 *  ambiguous with comparison in exactly the position that matters. */
export const KEY_TERMINATORS = [":", ",", "}", "("] as const;
/** The Kotlin facade's class header, read POSITIONALLY from here rather than by
 *  one regex. A single pattern cannot cross a nested `)` — a constructor default
 *  of `EscalationArm()` defeats any `[^)]*` — and a constructor is not optional
 *  detail: a `val` in it is a PUBLIC PROPERTY and therefore surface. */
export const KT_CLASS_HEAD = /^class ([A-Za-z_]\w*)\s*/m;
/** The supertype list and the body's opening brace, matched from just past the
 *  primary constructor. No match is FAIL-CLOSED: the reader returns null and the
 *  census reports a block it could not read, rather than falling through to a
 *  body-less read that would report an empty, flatteringly small surface. */
export const KT_CLASS_TAIL = /^\s*(?::\s*([^{]+?))?\s*\{/;
/** A member declaration at the class body's top level, with its modifiers.
 *
 *  THE MODIFIER RUN IS STRUCTURAL, NOT A LIST. The first shipping of this rule
 *  enumerated eleven modifier spellings, and a reviewer appended an `infix fun`
 *  to a live block — legal Kotlin, public surface — and the census shrank in
 *  the flattering direction with every gate green. Kotlin's modifier set is
 *  not closed by any list this file could carry, so the run is the FORM: any
 *  sequence of annotations (`@Name`, optionally with an unnested argument
 *  list) and lowercase word tokens before the declaring keyword. What the run
 *  still cannot cross (a nested annotation argument, a shape not yet seen) is
 *  not skipped — the keyword-conservation floor below turns it into a reported
 *  UNREADABLE member. */
export const KT_DECL =
  /(?:^|\n)[ \t]*((?:(?:@[A-Za-z_]\w*(?:\([^()]*\))?|[a-z]\w*)[ \t]+)*)(fun|val|var)\s+(?:<[^>]*>\s*)?([A-Za-z_]\w*)/g;
/** A NESTED TYPE declared in the class body — a reviewer's `class Defaults(…)`
 *  inside a live block was public surface no census row saw. Same structural
 *  modifier run; `enum class` arrives with `enum` riding the run. */
export const KT_TYPE_DECL =
  /(?:^|\n)[ \t]*((?:(?:@[A-Za-z_]\w*(?:\([^()]*\))?|[a-z]\w*)[ \t]+)*)(?:class|interface|object)\s+([A-Za-z_]\w*)/g;
/** Every keyword that DECLARES something in a class body. The conservation
 *  rule: each occurrence at body depth one (comments and strings are already
 *  stripped by the walker) must be consumed by a recognised declaration match,
 *  or the reader pushes UNREADABLE — the same fail-closed floor the TypeScript
 *  reader has had from the start. Counting keywords is what makes the floor
 *  form-keyed: a declaration this reader cannot parse still SPENDS a keyword,
 *  whatever its modifiers look like. */
export const KT_DECL_KEYWORD = /\b(?:fun|val|var|class|interface|object|typealias|constructor)\b/g;
/** A primary-constructor parameter that DECLARES a property. The `val`/`var`
 *  keyword is the whole test, and it is the language's own: a parameter without
 *  it is an argument the constructor consumes and publishes nothing. */
export const KT_CTOR_PROPERTY =
  /^\s*((?:@\w+(?:\([^()]*\))?\s*|(?:public|internal|private|protected|override|open|final|vararg)\s+)*)(val|var)\s+([A-Za-z_]\w*)/;

/** Modifiers that take a declaration OUT of the public surface entirely. */
const HIDDEN = /\b(private|protected|internal)\b/;

/**
 * `Any`'s members, which every Kotlin class inherits without declaring a
 * supertype. Overriding one of these is `override` in the language's eyes and
 * says NOTHING about the block contract, so crediting it inflates the port's
 * contract coverage with a role no block author was taught.
 *
 * ENUMERATION IS LEGITIMATE HERE AND ONLY HERE. Everywhere else in this
 * repository a rule that lists spellings has been defeated by the next one —
 * but `Any`'s member set is CLOSED and defined by the language, not by an idiom
 * a future landing can extend. It cannot grow behind this list. The mirror case
 * is deliberately NOT excluded: a class extending an abstract base that itself
 * implements the contract shows `override` on a member whose declaring type
 * this reader never opened, and that credit is CORRECT — the supertype is
 * declared in the file, so a fresh author reads it. `Any` is the only supertype
 * that is implicit, which is exactly why it is the only one excluded.
 */
export const ANY_MEMBERS: ReadonlySet<string> = new Set(["toString", "equals", "hashCode"]);

/**
 * The TypeScript block facade: the exported object literal's OWN keys.
 *
 * Keys are read at brace depth one only, in key position — the start of the
 * literal or just past a depth-one comma — so a nested handler table's keys are
 * not mistaken for the facade's. A key the reader cannot name is reported as
 * `UNREADABLE` rather than skipped.
 */
export function tsFacade(port: Port, block: string, path: string, source: string): Facade | null {
  const open = TS_FACADE.exec(source);
  if (open === null) return null;
  const annotation = (open[2] ?? "").replace(/^\s*:\s*/, "").trim();
  const members: Member[] = [];
  let keyPosition = true;
  const end = walkBody(source, open.index + open[0].length, TS_DIALECT, (char, at) => {
    if (char === "<open>" || char === "<close>") {
      keyPosition = false;
      return null;
    }
    if (char === ",") {
      keyPosition = true;
      return null;
    }
    if (!keyPosition || !/\S/.test(char)) return null;
    // A CLOSER IS THE END OF THE LITERAL, never a key. The facades in this tree
    // end `…,\n} as const;`, so the trailing comma leaves the reader in key
    // position and the very next non-space character is the closing brace — a
    // reader without this line reports every facade as having one unreadable
    // member, which is a red build over nothing.
    if (char === "}" || char === ")" || char === "]") return null;
    const rest = source.slice(at);
    const id = /^([A-Za-z_$][\w$]*)/.exec(rest);
    const quoted = /^(["'])((?:[^\\]|\\.)*?)\1/.exec(rest);
    keyPosition = false;
    const read = id ?? quoted;
    if (read !== null) {
      // …AND IT MUST ACTUALLY BE A KEY. An identifier at key position is only a
      // member when a key terminator follows it; otherwise the reader has landed
      // mid-expression — inside a type argument list, most cheaply — and naming
      // what it found would invent a member out of a TYPE. Fail-closed.
      const after = source.slice(at + read[0].length).match(/^\s*(\S)/);
      if (after !== null && (KEY_TERMINATORS as readonly string[]).includes(after[1] ?? "")) {
        members.push({ name: (id ? id[1] : quoted?.[2]) ?? "", pinned: false });
        return at + read[0].length;
      }
    }
    members.push({ name: UNREADABLE, pinned: false });
    return null;
  });
  const tail = source.slice(end, end + 200);
  const satisfies = TS_SATISFIES.exec(tail);
  const contract = annotation !== "" ? annotation : (satisfies?.[1] ?? null);
  return { port, block, path, symbol: open[1] ?? "", contract, members };
}

/**
 * The Kotlin block facade: the class's PUBLIC members, each carrying whether a
 * supertype requires it. Read in three positional steps — head, primary
 * constructor, body — because a class header is not a regular language and a
 * single pattern that pretends otherwise loses the constructor.
 *
 * `override` is the whole reading of `pinned`, and it is exact rather than a
 * heuristic: Kotlin refuses the keyword on a member no supertype declares and
 * refuses its absence on one that is. So the compiler has already answered the
 * question this census asks, and the census only has to count the answer —
 * except for `Any`'s three members, which every class inherits without
 * declaring anything at all (see `ANY_MEMBERS`).
 */
export function ktFacade(port: Port, block: string, path: string, source: string): Facade | null {
  const head = KT_CLASS_HEAD.exec(source);
  if (head === null) return null;
  const members: Member[] = [];

  // STEP ONE — the primary constructor, if the class declares one. Walked with
  // the same balancing scanner as the body, so a default value carrying its own
  // parentheses, braces or string is crossed rather than fatal.
  let resume = head.index + head[0].length;
  if (source[resume] === "(") {
    const chunks: string[] = [];
    let buffer = "";
    resume = walkBody(source, resume + 1, KT_DIALECT, (char) => {
      if (char === "<open>" || char === "<close>") return null;
      if (char === ",") {
        chunks.push(buffer);
        buffer = "";
        return null;
      }
      if (char !== ")") buffer += char;
      return null;
    });
    chunks.push(buffer);
    for (const chunk of chunks) {
      const property = KT_CTOR_PROPERTY.exec(chunk);
      if (property === null) continue;
      const modifiers = property[1] ?? "";
      if (HIDDEN.test(modifiers)) continue;
      const name = property[3] ?? "";
      members.push({ name, pinned: isPinned(modifiers, name) });
    }
  }

  // STEP TWO — the supertype list and the body's opening brace. FAIL-CLOSED.
  const tail = KT_CLASS_TAIL.exec(source.slice(resume));
  if (tail === null) return null;
  const bodyStart = resume + tail[0].length;

  // STEP THREE — the body, at its own top level only.
  const regions: string[] = [];
  let region = "";
  walkBody(source, bodyStart, KT_DIALECT, (char) => {
    if (char === "<open>") {
      regions.push(region);
      region = "";
      return null;
    }
    if (char !== "<close>") region += char;
    return null;
  });
  regions.push(region);
  for (const text of regions) {
    const lined = `\n${text}`;
    const decls = [...lined.matchAll(KT_DECL)];
    const types = [...lined.matchAll(KT_TYPE_DECL)];
    for (const found of decls) {
      const modifiers = found[1] ?? "";
      if (HIDDEN.test(modifiers)) continue;
      const name = found[3] ?? "";
      members.push({ name, pinned: isPinned(modifiers, name) });
    }
    for (const found of types) {
      const modifiers = found[1] ?? "";
      if (HIDDEN.test(modifiers)) continue;
      members.push({ name: found[2] ?? "", pinned: false });
    }
    // THE CONSERVATION FLOOR. Every declaring keyword in this depth-one text
    // must have been spent by a match above; an excess is a declaration the
    // reader saw and could not classify, and it is REPORTED, never skipped —
    // invisible members shrink the surface in exactly the direction this
    // module exists to refuse.
    const present = (lined.match(KT_DECL_KEYWORD) ?? []).length;
    const consumed = [...decls, ...types].reduce(
      (total, found) => total + ((found[0] ?? "").match(KT_DECL_KEYWORD) ?? []).length,
      0,
    );
    for (let excess = present - consumed; excess > 0; excess -= 1) {
      members.push({ name: UNREADABLE, pinned: false });
    }
  }

  const supertypes = (tail[1] ?? "").trim();
  return {
    port,
    block,
    path,
    symbol: head[1] ?? "",
    contract: supertypes === "" ? null : supertypes,
    members,
  };
}

/** Contract-taught: declared `override`, and not one of `Any`'s own. */
function isPinned(modifiers: string, name: string): boolean {
  return /\boverride\b/.test(modifiers) && !ANY_MEMBERS.has(name);
}

/** Every facade in the corpus, in corpus order. A source the port's reader
 *  cannot parse yields null, and `teachabilityProblems` reports it — an unparsed
 *  block would otherwise leave the census quietly smaller and better. */
export function readFacades(sources: readonly BlockSource[]): (Facade | null)[] {
  return sources.map((source) =>
    source.port === "kotlin"
      ? ktFacade(source.port, source.block, source.path, source.source)
      : tsFacade(source.port, source.block, source.path, source.source),
  );
}

/** The port's census: totals, the universal shape, and the unpinned remainder. */
export function censusOf(facades: readonly Facade[], port: Port): PortCensus {
  const mine = facades.filter((facade) => facade.port === port);
  const names = mine.map((facade) => new Set(facade.members.map((member) => member.name)));
  const first = names[0];
  const universal =
    first === undefined
      ? []
      : [...first].filter((name) => names.every((set) => set.has(name))).sort();
  const pinnedEverywhere = (name: string): boolean =>
    mine.every((facade) => facade.members.some((member) => member.name === name && member.pinned));
  return {
    facades: mine.length,
    members: mine.reduce((total, facade) => total + facade.members.length, 0),
    pinned: mine.reduce(
      (total, facade) => total + facade.members.filter((member) => member.pinned).length,
      0,
    ),
    universal,
    unpinnedUniversal: universal.filter((name) => !pinnedEverywhere(name)),
  };
}

/** The literal a port's receipt owes: `TypeScript 0/50`. Derived from the census
 *  and never typed twice — the prose is judged against the measurement, which is
 *  the only thing that stops a receipt claiming a pass. */
export function fractionOf(port: Port, census: PortCensus): string {
  return `${PORT_LABEL[port]} ${census.pinned}/${census.members}`;
}

/**
 * ONE ATTRIBUTED LITERAL PER PORT — the whole receipt for that port, fraction
 * and owed names together, with the port's own label inside it.
 *
 * The shape is the point. A per-name substring search over the whole note is
 * satisfiable from ANYWHERE in it, so a sentence about Kotlin can silently pay
 * TypeScript's debt and a port's list can shrink to nothing while the check
 * stays green — MEASURED, on this repository's own receipt, before this
 * function existed. Binding the label, the fraction and the list into a single
 * derived string makes cross-port satisfaction structurally impossible and makes
 * the list unshrinkable: it is one literal, so it matches whole or not at all.
 */
export function receiptLine(port: Port, census: PortCensus): string {
  const owed = census.unpinnedUniversal;
  const inferred = owed.length === 0 ? "nothing" : owed.map((name) => `\`${name}\``).join(", ");
  return `${fractionOf(port, census)} — inferred: ${inferred}`;
}

/** Prose wraps; a literal does not. Comparing whitespace-normalised text is what
 *  lets a receipt line be written as ordinary paragraph text rather than as an
 *  unbreakable line an author would eventually reflow and redden. */
export function normalise(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** The text under a `**…**` heading inside one CHANGELOG entry body: from the
 *  heading to the next line-initial `**`, or the end of the entry. Scoped rather
 *  than whole-body so the receipt's numbers cannot be satisfied by a sentence
 *  somewhere else in the entry. */
export function noteUnder(body: string, heading: string): string | null {
  const at = body.indexOf(heading);
  if (at < 0) return null;
  const rest = body.slice(at + heading.length);
  const next = rest.search(/\n\*\*/);
  return next < 0 ? rest : rest.slice(0, next);
}

/** The CHANGELOG's framing text — everything before the first entry heading.
 *  This is what an author writing a release entry actually reads, which is why
 *  it carries obligations of its own. */
export function preambleOf(changelog: string): string {
  const at = changelog.search(/^##[ \t]/m);
  return at < 0 ? changelog : changelog.slice(0, at);
}

/**
 * Every way the teachability metric can be un-run, as one list of sentences.
 * Empty is the only passing result. A nonzero DEFICIT is not among them — the
 * measurement's job is to be true, not to be zero, and the deficit is real in
 * both ports today. What is denied is a census that cannot be taken, a receipt
 * that does not match the one that was, a verdict the numbers do not support,
 * and a document that has stopped telling its author any of this is owed.
 */
export function teachabilityProblems(corpus: TeachabilityCorpus): string[] {
  const problems: string[] = [];
  const facades: Facade[] = [];
  readFacades(corpus.sources).forEach((facade, index) => {
    const source = corpus.sources[index];
    if (source === undefined) return;
    if (facade === null) {
      problems.push(`${source.path}: no block facade found — the census cannot read this block`);
      return;
    }
    if (facade.members.length === 0) {
      problems.push(`${source.path}: the facade \`${facade.symbol}\` publishes no member`);
    }
    for (const member of facade.members) {
      if (member.name === UNREADABLE) {
        problems.push(
          `${source.path}: the facade \`${facade.symbol}\` has a member the census cannot name`,
        );
      }
    }
    if (facade.port === "typescript" && facade.contract !== null) {
      problems.push(
        `${source.path}: \`${facade.symbol}\` now declares the contract \`${facade.contract}\` — the census credits no TypeScript member until it can read WHICH members a contract requires`,
      );
    }
    if (facade.port === "kotlin" && facade.contract === null) {
      problems.push(
        `${source.path}: the class \`${facade.symbol}\` declares no supertype, so no member of it is contract-pinned`,
      );
    }
    facades.push(facade);
  });

  for (const obligation of RITUAL_OBLIGATIONS) {
    if (!corpus.ritual.includes(obligation)) {
      problems.push(
        `the release ritual no longer carries the teachability hook: \`${obligation}\``,
      );
    }
  }

  const preamble = preambleOf(corpus.changelog);
  for (const obligation of CHANGELOG_OBLIGATIONS) {
    if (!preamble.includes(obligation)) {
      problems.push(
        `the CHANGELOG's own preamble does not tell an author it owes: \`${obligation}\``,
      );
    }
  }

  const log = entries(corpus.changelog);
  if (log.length === 0) {
    problems.push("the CHANGELOG carries no entry, so the census has nowhere to be recorded");
  }
  for (const entry of log) {
    if (!entry.body.includes(RECEIPT_HEADING)) {
      problems.push(`the CHANGELOG entry \`${entry.key}\` records no teachability finding`);
    }
  }

  // THE LIVE RECEIPT. Only the NEWEST entry is measured against today's tree: an
  // older entry states what the census said at ITS release and must keep saying
  // it, because rewriting a past finding to match a present tree is exactly the
  // softening this metric exists to refuse.
  const newest = log[0];
  const note = newest === undefined ? null : noteUnder(newest.body, RECEIPT_HEADING);
  if (newest !== undefined && note !== null) {
    const flat = normalise(note);
    let owed = false;
    for (const port of PORTS) {
      const census = censusOf(facades, port);
      if (census.facades === 0) {
        problems.push(`the census read no ${port} facade at all`);
        continue;
      }
      if (census.unpinnedUniversal.length > 0) owed = true;
      const line = receiptLine(port, census);
      if (!flat.includes(normalise(line))) {
        problems.push(
          `the \`${newest.key}\` teachability finding does not state the measured \`${line}\``,
        );
      }
    }
    // THE VERDICT, bound to the same census as the numbers. Correct numbers
    // under an inverted reading is the cheapest softening there is, and it was
    // green here before this ran.
    const required = owed ? VERDICT_DEFICIT : VERDICT_SUFFICIENT;
    const refused = owed ? VERDICT_SUFFICIENT : VERDICT_DEFICIT;
    if (!flat.includes(required)) {
      problems.push(
        `the \`${newest.key}\` teachability finding states no verdict the census supports: it owes \`${required}\``,
      );
    }
    if (flat.includes(refused)) {
      problems.push(
        `the \`${newest.key}\` teachability finding claims \`${refused}\`, which the census contradicts`,
      );
    }
  }

  return problems;
}
