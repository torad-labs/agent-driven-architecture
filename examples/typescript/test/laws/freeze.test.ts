// ── THE FREEZE-RECONCILIATION CHECK — the ADR's arithmetic, adjudicated ───
//
// ADR-001 §4 predicts a per-block frozen surface, the Kotlin port's
// binary-compatibility-validator MEASURES one, and §4 then writes down the
// deltas that carry the prediction to the measurement. Nothing read any of it.
// The failure that bought this module was exactly that silence: the landing
// that wired the validator wrote "+3 for triage and +4 for console" into §4
// while the committed `console.api` carried EIGHT declarations against a
// prediction of five, so the document reconciled console to nine and no gate
// moved. The same landing left §6's register still stating the retracted
// prediction as measured fact, and left the port README and OPEN-GAPS stating a
// third and fourth copy of the same series.
//
// So this module re-derives the measurement from the artefact that cannot lie —
// the committed dumps — and re-reads EVERY number of the argument out of the
// prose. Nothing here is typed twice: the block ORDER, the predicted series,
// the floor, each per-block delta and each enumerated symbol are extracted with
// pinned patterns, and a number this file supplied on both sides would be
// comparing the checker with itself.
//
// THE COUNTING RULE, stated once because the whole module rests on it. A
// `<module>.api` dump is JVM shape, not Kotlin shape, so "how many declarations
// does this block expose" needs a rule and the rule needs to be written down:
//
//   · a line at column zero declaring a `class` is one top-level JVM class;
//   · a simple name carrying `$` is a NESTED leaf — `TicketStatus$Open` is a
//     `sealed` variant of a class already counted — so it is not counted again;
//   · a simple name ending `Kt` is the SYNTHETIC per-file facade Kotlin emits to
//     carry a file's top-level declarations. It is not a declaration anybody
//     wrote, so it is replaced by the statics it carries: a `static final field`
//     is a `const val`, and a `static final fun getX` is the getter of a
//     top-level `val`. Both fold to the property name, so a declaration that
//     emits both is still one declaration.
//
// WHY IT LIVES IN THE TYPESCRIPT PORT. Same reason every other cross-port law
// does: `test/laws/` is where this repository keeps the checks whose subject is
// a DOCUMENT rather than a language, and it is the one suite both ports' gates
// are judged against. It reads the Kotlin tree and never builds it.
//
// IT IS NOT A NEW DENYING CHECK. The C1-C17 roster is per-rule denials over
// SOURCE with a fixture pair each; this is arithmetic over prose and generated
// artefacts, in the same band as the count-coherence and quickstart laws that
// also sit here uncounted.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");
const BLOCKS_DIR = join(REPO, "examples", "kotlin", "block");

/** THE PINNED PATTERNS. Each carries exactly one capture and no other digit, so
 *  rewording a sentence is free and deleting its number is not. */
export const ORDER = /\*\*lower bound\*\* for\s+([a-z]+(?:\s*·\s*[a-z]+)+)/;
export const FLOOR = /leaving \*\*([\d\s·]+)\*\* as the `:app`-named \*\*lower bound\*\*/;
export const PREDICTED = /Predicted here, before the validator was wired, as \*\*([\d\s·]+)\*\*/;
export const MEASURED = /commits carry \*\*([\d\s·]+)\*\* for the same six blocks/;
export const DELTA = /\*\*([+-]\d+) for ([a-z]+)\*\*/g;
export const ABSENT = /`(\w+)` \(([a-z]+)\) and\s+`(\w+)` \(([a-z]+)\) are counted here/;
export const NAMED =
  /it names ((?:`\w+`(?:, | and ))+`\w+`) in ([a-z]+), and\s+((?:`\w+`(?:, | and ))+`\w+`) in ([a-z]+)/;
/** Any six-term `N · N · N · N · N · N`, in both the spaced and unspaced
 *  spellings the three documents use. Every occurrence must be one of the three
 *  series the argument declares; a fourth is a stale copy by definition. */
export const SERIES = /\d+(?:\s*·\s*\d+){5}/g;

const TOP_LEVEL = /^public\s.*\bclass\s+(\S+)/;
const FACADE_FIELD = /^\tpublic static final field (\w+) /;
const FACADE_PROPERTY = /^\tpublic static final fun (?:get|set)([A-Z]\w*) /;
const FACADE_FUN = /^\tpublic static (?:final )?fun ([\w$-]+) /;

/** The frozen declarations a committed dump carries, under the rule above. */
export function frozenSymbols(dump: string): string[] {
  const out = new Set<string>();
  let inFacade = false;
  for (const line of dump.split("\n")) {
    const declared = TOP_LEVEL.exec(line);
    if (declared !== null) {
      const simple = (declared[1] ?? "").split("/").pop() ?? "";
      inFacade = false;
      if (simple.includes("$")) continue;
      if (simple.endsWith("Kt")) {
        inFacade = true;
        continue;
      }
      out.add(simple);
      continue;
    }
    if (!inFacade || !line.startsWith("\t")) continue;
    const member = FACADE_FIELD.exec(line) ?? FACADE_PROPERTY.exec(line) ?? FACADE_FUN.exec(line);
    if (member !== null) out.add(member[1] ?? "");
  }
  return [...out].sort();
}

const series = (said: string): number[] =>
  said
    .split("·")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));

const backticked = (said: string): string[] =>
  [...said.matchAll(/`(\w+)`/g)].map((m) => m[1] ?? "");

export interface Documents {
  readonly adr: string;
  readonly readme: string;
  readonly gaps: string;
}

/** Every way the ADR's frozen-surface argument can disagree with the dumps, with
 *  itself, or with the two documents that restate it. One string per defect, so
 *  a failure names the number rather than the assertion. */
export function freezeProblems(docs: Documents, dumps: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  const say = (what: string): number => problems.push(what);

  const order = ORDER.exec(docs.adr);
  if (order === null) return ["ADR-001 §4 no longer names the block order the series are in"];
  const blocks = (order[1] ?? "").split("·").map((b) => b.trim());

  const missing = blocks.filter((b) => !dumps.has(b));
  const extra = [...dumps.keys()].filter((b) => !blocks.includes(b));
  if (missing.length > 0) say(`§4 names ${missing.join(", ")}; no dump was read for them`);
  if (extra.length > 0) say(`dumps exist for ${extra.join(", ")}; §4's order does not name them`);
  if (missing.length > 0 || extra.length > 0) return problems;

  const frozen = new Map(blocks.map((b) => [b, frozenSymbols(dumps.get(b) ?? "")]));
  const measured = blocks.map((b) => (frozen.get(b) ?? []).length);

  // (i) the series §4 states as MEASURED is the series the dumps carry.
  const stated = MEASURED.exec(docs.adr);
  if (stated === null) say("ADR-001 §4 no longer states a measured series");
  else if (series(stated[1] ?? "").join(" ") !== measured.join(" ")) {
    say(
      `§4 says the dumps carry ${series(stated[1] ?? "").join(" · ")}; they carry ${measured.join(
        " · ",
      )}`,
    );
  }

  // (ii) prediction plus every stated delta lands exactly on the measurement.
  const predictedSaid = PREDICTED.exec(docs.adr);
  if (predictedSaid === null) {
    say("ADR-001 §4 no longer states the series it predicted before the validator was wired");
    return problems;
  }
  const predicted = series(predictedSaid[1] ?? "");
  if (predicted.length !== blocks.length) {
    say(`§4's predicted series has ${predicted.length} terms for ${blocks.length} blocks`);
    return problems;
  }
  const deltas = new Map(blocks.map((b) => [b, 0]));
  const growth = new Map(blocks.map((b) => [b, 0]));
  const shrink = new Map(blocks.map((b) => [b, 0]));
  let read = 0;
  for (const m of docs.adr.matchAll(DELTA)) {
    const amount = Number(m[1]);
    const block = m[2] ?? "";
    if (!deltas.has(block)) {
      say(`§4 states a delta for "${block}", which is not one of the six blocks`);
      continue;
    }
    read += 1;
    deltas.set(block, (deltas.get(block) ?? 0) + amount);
    if (amount > 0) growth.set(block, (growth.get(block) ?? 0) + amount);
    else shrink.set(block, (shrink.get(block) ?? 0) - amount);
  }
  if (read === 0) say("§4 states no per-block delta at all — the reconciliation is unreadable");
  blocks.forEach((block, index) => {
    const reconciled = (predicted[index] ?? 0) + (deltas.get(block) ?? 0);
    if (reconciled !== measured[index]) {
      say(
        `§4 reconciles ${block} to ${reconciled} (predicted ${predicted[index]}, deltas ${
          deltas.get(block) ?? 0
        }); the dump carries ${measured[index]}`,
      );
    }
  });

  // (iii) the symbols §4 ENUMERATES as newly public are exactly the growth it
  // claims, and each one is really in that block's dump. A delta is a number; an
  // enumeration is a promise about names, and the two can drift apart in silence.
  const named = NAMED.exec(docs.adr);
  if (named === null) say("ADR-001 §4 no longer enumerates the symbols the root harness names");
  else {
    for (const [list, block] of [
      [named[1] ?? "", named[2] ?? ""],
      [named[3] ?? "", named[4] ?? ""],
    ] as const) {
      const names = backticked(list);
      if (names.length !== (growth.get(block) ?? 0)) {
        say(
          `§4 enumerates ${names.length} symbol(s) for ${block} but claims a growth of ${
            growth.get(block) ?? 0
          }`,
        );
      }
      for (const name of names) {
        if (!(frozen.get(block) ?? []).includes(name)) {
          say(`§4 names ${name} as public in ${block}; that block's dump does not carry it`);
        }
      }
    }
  }

  // (iv) the symbols §4 says a block dump CANNOT carry are absent from it, and
  // each one accounts for exactly one of that block's negative deltas.
  const absent = ABSENT.exec(docs.adr);
  if (absent === null) say("ADR-001 §4 no longer names the symbols a block dump cannot carry");
  else {
    const claimed = new Map(blocks.map((b) => [b, 0]));
    for (const [name, block] of [
      [absent[1] ?? "", absent[2] ?? ""],
      [absent[3] ?? "", absent[4] ?? ""],
    ] as const) {
      claimed.set(block, (claimed.get(block) ?? 0) + 1);
      if ((frozen.get(block) ?? []).includes(name)) {
        say(`§4 says ${block}'s dump cannot carry ${name}; it does`);
      }
    }
    for (const block of blocks) {
      if ((claimed.get(block) ?? 0) !== (shrink.get(block) ?? 0)) {
        say(
          `§4 names ${claimed.get(block) ?? 0} unreachable symbol(s) for ${block} but subtracts ${
            shrink.get(block) ?? 0
          }`,
        );
      }
    }
  }

  // (v) NO STALE COPY ANYWHERE. Three documents restate these series; the
  // landing that bought this module left one of them stating a retracted one as
  // fact. Every six-term series in all three must be the floor, the prediction
  // or the measurement.
  const floorSaid = FLOOR.exec(docs.adr);
  const allowed = new Set(
    [
      measured.join(" "),
      predicted.join(" "),
      floorSaid === null ? "" : series(floorSaid[1] ?? "").join(" "),
    ].filter((s) => s !== ""),
  );
  if (floorSaid === null) say("ADR-001 §4 no longer states the `:app`-named lower bound");
  for (const [where, text] of [
    ["ADR-001", docs.adr],
    ["examples/kotlin/README.md", docs.readme],
    ["OPEN-GAPS.md", docs.gaps],
  ] as const) {
    for (const m of text.matchAll(SERIES)) {
      const said = series(m[0]);
      if (!allowed.has(said.join(" "))) {
        say(`${where} states ${said.join(" · ")}, which is none of the three declared series`);
      }
    }
  }

  return problems;
}

const docs: Documents = {
  adr: readFileSync(join(REPO, "docs", "adr", "ADR-001-compile-enforced-seams.md"), "utf8"),
  readme: readFileSync(join(REPO, "examples", "kotlin", "README.md"), "utf8"),
  gaps: readFileSync(join(REPO, "OPEN-GAPS.md"), "utf8"),
};

/** The committed dumps, read off disk by block name — never enumerated here, so
 *  a seventh block joins the corpus by existing. */
const dumps = new Map(
  readdirSync(BLOCKS_DIR).map((block) => [
    block,
    readFileSync(join(BLOCKS_DIR, block, "api", `${block}.api`), "utf8"),
  ]),
);

describe("ADR-001 §4's frozen-surface arithmetic reconciles against the committed dumps", () => {
  it("read six dumps and parsed a real surface out of each — the check is not vacuous", () => {
    expect(dumps.size).toBe(6);
    for (const [block, dump] of dumps) {
      expect(dump.length, block).toBeGreaterThan(500);
      expect(frozenSymbols(dump).length, block).toBeGreaterThan(3);
    }
    // The rule's two hard cases are LIVE in this corpus, so neither clause is
    // reading air: escalation carries `TicketStatus$Open` and friends, and every
    // block carries a `ToolsKt` facade.
    expect(dumps.get("escalation") ?? "").toContain("TicketStatus$Open");
    expect(frozenSymbols(dumps.get("escalation") ?? "")).not.toContain("TicketStatus$Open");
    expect(dumps.get("triage") ?? "").toContain("class adr/blocks/triage/ToolsKt");
    expect(frozenSymbols(dumps.get("triage") ?? "")).not.toContain("ToolsKt");
    expect(frozenSymbols(dumps.get("triage") ?? "")).toContain("PRE_V2_REASON");
  });

  it("the prediction, every stated delta and every enumerated symbol agree with the dumps", () => {
    expect(freezeProblems(docs, dumps)).toEqual([]);
  });

  it("DENIES a wrong delta — the arithmetic is really being run", () => {
    // The measured counterexample, restored: the landing wrote "+4 for console".
    const wrong = docs.adr.replace("**+3 for console**", "**+4 for console**");
    expect(wrong).not.toBe(docs.adr);
    const said = freezeProblems({ ...docs, adr: wrong }, dumps);
    expect(said.some((s) => s.includes("reconciles console to 9"))).toBe(true);
    // …and the enumeration half reports it independently, which is what makes
    // the two clauses a cross-check rather than one rule written twice.
    expect(said.some((s) => s.includes("enumerates 3 symbol(s) for console"))).toBe(true);
  });

  it("DENIES a stale measured series, wherever the copy sits", () => {
    for (const key of ["adr", "readme", "gaps"] as const) {
      const stale = docs[key].replace(/8(\s*)·(\s*)8\1·\2 ?5/, "9$1·$27$1·$25");
      if (stale === docs[key]) continue;
      expect(freezeProblems({ ...docs, [key]: stale }, dumps).length).toBeGreaterThan(0);
    }
    // The unspaced spelling OPEN-GAPS uses is read too, checked directly rather
    // than left to the loop above finding it.
    const gaps = docs.gaps.replace("8·8·5·8·8·8", "8·8·5·8·8·7");
    expect(gaps).not.toBe(docs.gaps);
    expect(freezeProblems({ ...docs, gaps }, dumps)).toEqual([
      "OPEN-GAPS.md states 8 · 8 · 5 · 8 · 8 · 7, which is none of the three declared series",
    ]);
  });

  it("DENIES an enumerated symbol the dump does not carry, and a broken absence claim", () => {
    const renamed = docs.adr.replace(
      "`ConsoleProjection` and `ViewState` in console",
      "`ConsoleProjection` and `ViewStat` in console",
    );
    expect(renamed).not.toBe(docs.adr);
    expect(
      freezeProblems({ ...docs, adr: renamed }, dumps).some((s) =>
        s.includes("names ViewStat as public in console"),
      ),
    ).toBe(true);

    // …and the mirror: a symbol §4 says a block cannot carry, which it does.
    const swapped = docs.adr.replace("`Priority` (triage)", "`TicketRow` (triage)");
    expect(swapped).not.toBe(docs.adr);
    expect(
      freezeProblems({ ...docs, adr: swapped }, dumps).some((s) =>
        s.includes("cannot carry TicketRow"),
      ),
    ).toBe(true);
  });

  it("DENIES a deleted sentence, not only a wrong number", () => {
    for (const sentence of [
      "Predicted here, before the validator was wired, as",
      "commits carry",
      "as the `:app`-named",
      "it names",
      "are counted here",
    ]) {
      const cut = docs.adr.replace(sentence, "");
      expect(cut).not.toBe(docs.adr);
      expect(freezeProblems({ ...docs, adr: cut }, dumps).length, sentence).toBeGreaterThan(0);
    }
  });
});
