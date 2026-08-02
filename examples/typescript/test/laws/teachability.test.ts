// ── THE TEACHABILITY CENSUS'S OWN BLOCK-TEST AND ALLOW-TEST ───────────────
//
// §15.2's bar, applied to the census: the pure function in teachability.ts is run
// against checked-in VIOLATING inputs it must reject case by case, and a
// COMPLIANT set it must pass in silence. Every rejection is asserted against its
// own specific message, so weakening one predicate goes red on its own.
//
// THE LIVE HALF IS WHERE THIS CHECK EARNS ITS KEEP, and it is two assertions
// rather than one. The first runs the judge over the shipped tree. The second
// pins the MEASUREMENT itself — every block's member count and pinned count, in
// both ports — because a reader whose regexes stopped matching the live idiom
// would report an empty surface, no problems, and a perfect silence. A census
// that has quietly stopped reading the tree is exactly the vacuous check this
// repository has shipped before; the pin is what makes that a red build.
//
// THE PINNED NUMBERS ARE NOT A TARGET. They are a photograph. A block that gains
// a public member moves them and must move them: a member a fresh author has to
// infer is the failure G13's test is looking for, so the diff is the point.
//
// TWO KINDS OF FIXTURE LIVE UNDER compliant/. Four of them — ts-alpha, ts-beta,
// kt-alpha, kt-beta — are the CORPUS the allow-test runs whole, and their
// numbers are asserted so the compliant half cannot pass by being unreadable.
// The rest are READER-SHAPE fixtures, asserted directly against one reader,
// because what they pin is what the reader SEES rather than what the judge says
// about it: a constructor property, a nested default, a template hole, an
// `Any` override. They are compliant in the sense that matters — none of them
// produces a problem — and they are kept out of the corpus so the corpus's
// census stays a small, hand-checkable number.
//
// The fixture corpora are plain `.txt` and `.md` rather than real `.ts` and
// `.kt`, for the reason release.test.ts records beside its own: this checker keys
// on the text of a declaration and not on a file extension, so source extensions
// would buy nothing and cost three build-config exclusions.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANY_MEMBERS,
  type BlockSource,
  CHANGELOG_OBLIGATIONS,
  censusOf,
  type Facade,
  fractionOf,
  KEY_TERMINATORS,
  KT_CLASS_HEAD,
  KT_CLASS_TAIL,
  KT_CTOR_PROPERTY,
  KT_DECL,
  KT_DECL_KEYWORD,
  KT_DIALECT,
  KT_TYPE_DECL,
  ktFacade,
  normalise,
  noteUnder,
  PORT_LABEL,
  PORTS,
  type Port,
  preambleOf,
  RECEIPT_HEADING,
  RITUAL_OBLIGATIONS,
  readFacades,
  receiptLine,
  type TeachabilityCorpus,
  TS_DIALECT,
  TS_FACADE,
  TS_SATISFIES,
  teachabilityProblems,
  tsFacade,
  UNREADABLE,
  VERDICT_DEFICIT,
  VERDICT_SUFFICIENT,
} from "./teachability";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

/** The two homes a block's one public symbol lives in, per port. Templates, not
 *  a list of blocks: the block SET is discovered off the filesystem below, so a
 *  seventh block joins the census by existing rather than by being enumerated
 *  here — which is the failure mode every enumerated spelling in this repository
 *  has eventually hit. */
const TS_HOME = (block: string): string => `examples/typescript/src/blocks/${block}/register.ts`;
const KT_HOME = (block: string): string =>
  `examples/kotlin/block/${block}/src/main/kotlin/adr/blocks/${block}/Register.kt`;

const tsBlocks = readdirSync(join(REPO, "examples/typescript/src/blocks")).sort();
const ktBlocks = readdirSync(join(REPO, "examples/kotlin/block")).sort();

const liveSources: BlockSource[] = tsBlocks.flatMap((block) => [
  { port: "typescript" as const, block, path: TS_HOME(block), source: read(TS_HOME(block)) },
  { port: "kotlin" as const, block, path: KT_HOME(block), source: read(KT_HOME(block)) },
]);

const live: TeachabilityCorpus = {
  sources: liveSources,
  ritual: read("RELEASE-RITUAL.md"),
  changelog: read("CHANGELOG.md"),
};

const liveFacades = readFacades(liveSources).filter((facade): facade is Facade => facade !== null);
const facadeAt = (port: Port, block: string): Facade | undefined =>
  liveFacades.find((facade) => facade.port === port && facade.block === block);

/**
 * THE MEASUREMENT, PINNED — `members` is what the block's one public symbol
 * publishes, `pinned` how many of those some declared contract requires. The
 * whole finding is in the second column: Kotlin holds two per block through its
 * declared block contract; TypeScript holds none, because it declares no block
 * contract at all.
 */
const CENSUS_PIN: Readonly<Record<string, { members: number; pinned: number }>> = {
  "typescript/analysis": { members: 8, pinned: 0 },
  "typescript/artifact": { members: 8, pinned: 0 },
  "typescript/console": { members: 8, pinned: 0 },
  "typescript/escalation": { members: 10, pinned: 0 },
  "typescript/inbox": { members: 7, pinned: 0 },
  "typescript/triage": { members: 9, pinned: 0 },
  "kotlin/analysis": { members: 7, pinned: 2 },
  "kotlin/artifact": { members: 5, pinned: 2 },
  "kotlin/console": { members: 5, pinned: 2 },
  "kotlin/escalation": { members: 6, pinned: 2 },
  "kotlin/inbox": { members: 4, pinned: 2 },
  "kotlin/triage": { members: 6, pinned: 2 },
};

describe("the teachability census reads the LIVE tree", () => {
  it("both ports ship the SAME six blocks — the census compares like with like", () => {
    expect(tsBlocks).toEqual(ktBlocks);
    expect(tsBlocks.length).toBe(6);
    expect(liveFacades.length).toBe(12);
  });

  it("the LIVE tree passes every rule the census enforces", () => {
    expect(teachabilityProblems(live)).toEqual([]);
  });

  it("PINS THE MEASUREMENT — a reader that stopped matching would report silence", () => {
    const measured: Record<string, { members: number; pinned: number }> = {};
    for (const facade of liveFacades) {
      measured[`${facade.port}/${facade.block}`] = {
        members: facade.members.length,
        pinned: facade.members.filter((member) => member.pinned).length,
      };
    }
    expect(measured).toEqual(CENSUS_PIN);
  });

  it("names the members, not just the counts — the pin is not a bare number", () => {
    // The one facade the ratified item asks to be read end to end. Spelled out
    // so a member that silently appears or disappears is a diff a reviewer sees
    // rather than an integer that moved by one.
    expect(facadeAt("typescript", "escalation")?.members.map((m) => m.name)).toEqual([
      "name",
      "register",
      "handlers",
      "arm",
      "view",
      "contextLines",
      "owns",
      "emptySlice",
      "sliceOf",
      "statusOf",
    ]);
    expect(facadeAt("kotlin", "escalation")?.members).toEqual([
      { name: "register", pinned: false },
      { name: "performer", pinned: false },
      { name: "arm", pinned: true },
      { name: "slice", pinned: false },
      { name: "view", pinned: true },
      { name: "contextLines", pinned: false },
    ]);
  });

  it("THE FINDING: the contract is not sufficient in either port, and by how much", () => {
    const ts = censusOf(liveFacades, "typescript");
    const kt = censusOf(liveFacades, "kotlin");
    expect(fractionOf("typescript", ts)).toBe("TypeScript 0/50");
    expect(fractionOf("kotlin", kt)).toBe("Kotlin 12/33");
    // WHAT AN IMPLEMENTER WOULD STILL HAVE TO INFER. Kotlin's block contract
    // pins the two roles its own header measured as universal; `register` is the
    // one role every block publishes that nothing requires, and that contract
    // states why it is not pinned. TypeScript declares no contract, so all seven
    // of its universal members are inferred by opening a sibling's register.ts.
    expect(ts.universal).toEqual([
      "arm",
      "contextLines",
      "emptySlice",
      "name",
      "owns",
      "register",
      "view",
    ]);
    expect(ts.unpinnedUniversal).toEqual(ts.universal);
    expect(kt.universal).toEqual(["arm", "register", "view"]);
    expect(kt.unpinnedUniversal).toEqual(["register"]);
  });

  it("the receipt in the CHANGELOG is the census's OWN line, read back whole", () => {
    // The anti-assertion assertion. The finding is prose, and prose can claim a
    // pass; this is what stops it. Each port's whole receipt — label, fraction
    // and owed names — is recomputed here from the live tree as ONE literal, so
    // neither the number nor the list can be softened, and the Kotlin sentence
    // cannot pay TypeScript's debt.
    const [newest] = live.changelog.split(/^## /m).slice(1);
    const note = noteUnder(newest ?? "", RECEIPT_HEADING);
    expect(note).not.toBeNull();
    const flat = normalise(note ?? "");
    expect(flat).toContain(receiptLine("typescript", censusOf(liveFacades, "typescript")));
    expect(flat).toContain(receiptLine("kotlin", censusOf(liveFacades, "kotlin")));
    // …and the VERDICT those numbers support, which is the half a release is
    // tempted to soften because it is free to write.
    expect(flat).toContain(VERDICT_DEFICIT);
    expect(flat).not.toContain(VERDICT_SUFFICIENT);
  });

  it("the CHANGELOG's own preamble states the obligation the census enforces", () => {
    // A rule an author cannot read is a rule an author breaks. The ritual tells
    // whoever is running a release to take the census; this file is what that
    // author is looking at while writing the entry, so it has to name the
    // heading it now requires and the machine that reads it.
    const preamble = preambleOf(live.changelog);
    for (const obligation of CHANGELOG_OBLIGATIONS) {
      expect(preamble).toContain(obligation);
    }
  });

  it("PINS THE PREDICATES — a weakened reader is a visible diff, not a silence", () => {
    expect(TS_FACADE.source).toBe(
      "^export const ([A-Za-z_$][\\w$]*)(\\s*:\\s*[^=]+?)?\\s*=\\s*\\{",
    );
    expect(TS_SATISFIES.source).toBe("^[^;\\n]*\\bsatisfies\\s+([A-Za-z_$][\\w$]*)");
    expect(KT_CLASS_HEAD.source).toBe("^class ([A-Za-z_]\\w*)\\s*");
    expect(KT_CLASS_TAIL.source).toBe("^\\s*(?::\\s*([^{]+?))?\\s*\\{");
    expect(KT_CTOR_PROPERTY.source).toBe(
      "^\\s*((?:@\\w+(?:\\([^()]*\\))?\\s*|(?:public|internal|private|protected|override|open|final|vararg)\\s+)*)(val|var)\\s+([A-Za-z_]\\w*)",
    );
    // The pin moved DELIBERATELY, and in the strengthening direction: the
    // enumerated eleven-modifier alternation lost to a reviewer's `infix fun`,
    // so the run is structural now (annotations + lowercase word tokens), a
    // nested-type pattern reads `class`/`interface`/`object` members, and the
    // keyword-conservation floor reports what neither pattern classifies.
    expect(KT_DECL.source).toBe(
      "(?:^|\\n)[ \\t]*((?:(?:@[A-Za-z_]\\w*(?:\\([^()]*\\))?|[a-z]\\w*)[ \\t]+)*)(fun|val|var)\\s+(?:<[^>]*>\\s*)?([A-Za-z_]\\w*)",
    );
    expect(KT_TYPE_DECL.source).toBe(
      "(?:^|\\n)[ \\t]*((?:(?:@[A-Za-z_]\\w*(?:\\([^()]*\\))?|[a-z]\\w*)[ \\t]+)*)(?:class|interface|object)\\s+([A-Za-z_]\\w*)",
    );
    expect(KT_DECL_KEYWORD.source).toBe(
      "\\b(?:fun|val|var|class|interface|object|typealias|constructor)\\b",
    );
    expect([...KEY_TERMINATORS]).toEqual([":", ",", "}", "("]);
    expect(TS_DIALECT).toEqual({ quotes: ['"', "'", "`"], holes: ["`"], raw: null });
    expect(KT_DIALECT).toEqual({ quotes: ['"', "'"], holes: ['"'], raw: '"""' });
    expect([...ANY_MEMBERS].sort()).toEqual(["equals", "hashCode", "toString"]);
    expect(RECEIPT_HEADING).toBe("**Teachability:**");
    expect(UNREADABLE).toBe("<unreadable>");
    expect(VERDICT_DEFICIT).toBe("*not* yet sufficient");
    expect(VERDICT_SUFFICIENT).toBe("sufficient in both ports");
    expect([...PORTS]).toEqual(["typescript", "kotlin"]);
    expect(PORT_LABEL).toEqual({ typescript: "TypeScript", kotlin: "Kotlin" });
    expect([...RITUAL_OBLIGATIONS]).toEqual([
      "The teachability test is run here, not on a schedule.",
      "examples/typescript/test/laws/teachability.ts",
    ]);
    expect([...CHANGELOG_OBLIGATIONS]).toEqual([
      "**Teachability:**",
      "examples/typescript/test/laws/teachability.ts",
    ]);
    // The receipt literal's SHAPE, both branches. One string per port carrying
    // the port label, so a sentence about the other port cannot satisfy it.
    expect(
      receiptLine("typescript", {
        facades: 1,
        members: 3,
        pinned: 1,
        universal: ["a", "b"],
        unpinnedUniversal: ["a", "b"],
      }),
    ).toBe("TypeScript 1/3 — inferred: `a`, `b`");
    expect(
      receiptLine("kotlin", {
        facades: 1,
        members: 3,
        pinned: 3,
        universal: ["a"],
        unpinnedUniversal: [],
      }),
    ).toBe("Kotlin 3/3 — inferred: nothing");
  });
});

// ── the block-test: every rule red on its own case ────────────────────────
const fixture = (half: string, name: string): string =>
  readFileSync(join(HERE, "fixtures", "teachability", half, name), "utf8");

const sourceOf = (port: Port, block: string, name: string, half = "compliant"): BlockSource => ({
  port,
  block,
  path: `fixtures/${half}/${name}`,
  source: fixture(half, name),
});

const COMPLIANT: TeachabilityCorpus = {
  sources: [
    sourceOf("typescript", "alpha", "ts-alpha.txt"),
    sourceOf("typescript", "beta", "ts-beta.txt"),
    sourceOf("kotlin", "alpha", "kt-alpha.txt"),
    sourceOf("kotlin", "beta", "kt-beta.txt"),
  ],
  ritual: fixture("compliant", "ritual.md"),
  changelog: fixture("compliant", "changelog.md"),
};

/** One swap at a time, so each case names exactly what it broke. */
const swap = (patch: Partial<TeachabilityCorpus>): string[] =>
  teachabilityProblems({ ...COMPLIANT, ...patch });

/** The compliant four with ONE facade replaced, named by port and file. */
const replacing = (port: Port, name: string): BlockSource[] =>
  COMPLIANT.sources.map((source, index) =>
    source.port === port && index % 2 === 0 ? sourceOf(port, "alpha", name, "violating") : source,
  );

describe("the teachability census DENIES a metric that was not run", () => {
  it("REJECTS a facade the reader cannot enumerate — a computed key", () => {
    // The spelling that has defeated four enumerated rules in this repository.
    // A member silently dropped is a port one member more teachable than it is.
    expect(swap({ sources: replacing("typescript", "ts-computed-key.txt") })).toContain(
      "fixtures/violating/ts-computed-key.txt: the facade `alpha` has a member the census cannot name",
    );
  });

  it("REJECTS a type argument mistaken for a member — the key terminator rule", () => {
    // A return-type annotation carrying two type arguments puts a comma at brace
    // depth one, which returns the walker to key position. Without the
    // terminator rule the reader NAMES A TYPE as a member — and since the census
    // then reports it as a role every block publishes, the receipt would be
    // COMPELLED to write a type into the release log as a block role.
    const facade = tsFacade(
      "typescript",
      "escalation",
      "p",
      fixture("violating", "ts-generic-comma.txt"),
    );
    expect(facade?.members.map((member) => member.name)).toEqual([
      "name",
      "arm",
      UNREADABLE,
      "view",
    ]);
    expect(facade?.members.map((member) => member.name)).not.toContain("EscalationEffect");
    expect(swap({ sources: replacing("typescript", "ts-generic-comma.txt") })).toContain(
      "fixtures/violating/ts-generic-comma.txt: the facade `escalation` has a member the census cannot name",
    );
  });

  it("REJECTS a TypeScript facade that grew a contract the reader cannot read", () => {
    // Fail-closed on PROGRESS, deliberately. "A contract exists" and "this
    // contract requires that member" are different claims, and crediting the
    // first as the second is how a census starts reporting a wall nobody built.
    expect(swap({ sources: replacing("typescript", "ts-satisfies.txt") })).toContain(
      "fixtures/violating/ts-satisfies.txt: `alpha` now declares the contract `BlockFacade` — the census credits no TypeScript member until it can read WHICH members a contract requires",
    );
  });

  it("REJECTS a register file the reader finds no facade in at all", () => {
    expect(swap({ sources: replacing("typescript", "ts-no-facade.txt") })).toContain(
      "fixtures/violating/ts-no-facade.txt: no block facade found — the census cannot read this block",
    );
  });

  it("REJECTS a facade that publishes nothing — found, and empty", () => {
    expect(swap({ sources: replacing("typescript", "ts-empty-facade.txt") })).toContain(
      "fixtures/violating/ts-empty-facade.txt: the facade `alpha` publishes no member",
    );
  });

  it("REJECTS a Kotlin facade that dropped its supertype list", () => {
    // The direction that would otherwise pass quietly: with no supertype nothing
    // is `override`, the pinned count falls to zero, and the census would report
    // a worse score as though it were a measurement rather than a deletion.
    expect(swap({ sources: replacing("kotlin", "kt-no-supertype.txt") })).toContain(
      "fixtures/violating/kt-no-supertype.txt: the class `AlphaBlock` declares no supertype, so no member of it is contract-pinned",
    );
  });

  it("REJECTS a Kotlin class header the reader cannot finish — FAIL-CLOSED", () => {
    // The header is read positionally now, and a positional read has a way to
    // get lost that a single regex does not: it can find the class and lose the
    // body. This is the assertion that the lost case returns NULL — reported —
    // rather than falling through to a body-less read, which would report an
    // empty surface as a small one and score the port better for being unread.
    expect(ktFacade("kotlin", "alpha", "p", fixture("violating", "kt-no-body.txt"))).toBeNull();
    expect(swap({ sources: replacing("kotlin", "kt-no-body.txt") })).toContain(
      "fixtures/violating/kt-no-body.txt: no block facade found — the census cannot read this block",
    );
  });

  it("REJECTS a ritual that has stopped naming the hook — owner and trigger both", () => {
    const problems = swap({ ritual: fixture("violating", "ritual-silent.md") });
    for (const obligation of RITUAL_OBLIGATIONS) {
      expect(problems).toContain(
        `the release ritual no longer carries the teachability hook: \`${obligation}\``,
      );
    }
  });

  it("REJECTS a CHANGELOG whose preamble never states the obligation", () => {
    // The rule an author reads nowhere. A release entry authored strictly from
    // the preamble was red on an undocumented rule until this fired — the check
    // that forces the document to keep telling its own author what it owes.
    const problems = swap({
      changelog: fixture("violating", "changelog-undocumented-obligation.md"),
    });
    for (const obligation of CHANGELOG_OBLIGATIONS) {
      expect(problems).toContain(
        `the CHANGELOG's own preamble does not tell an author it owes: \`${obligation}\``,
      );
    }
  });

  it("REJECTS an entry that records no finding — the release skipped the run", () => {
    expect(swap({ changelog: fixture("violating", "changelog-no-receipt.md") })).toContain(
      "the CHANGELOG entry `spine-2` records no teachability finding",
    );
  });

  it("REJECTS a finding whose numbers are not the ones the census measured", () => {
    // The false-landing signature this whole module exists to catch: the prose
    // says the tree is more teachable than it is, and every other rule passes.
    const problems = swap({ changelog: fixture("violating", "changelog-stale-numbers.md") });
    expect(problems).toContain(
      "the `spine-2` teachability finding does not state the measured `TypeScript 0/10 — inferred: `arm`, `name`, `register`, `view``",
    );
    expect(problems).toContain(
      "the `spine-2` teachability finding does not state the measured `Kotlin 4/8 — inferred: `register``",
    );
  });

  it("REJECTS a finding that states the numbers and not WHICH members", () => {
    // The counts alone are a score. The item's actual ask is the list of what an
    // implementer would still have to infer, so the list rides inside the same
    // literal as the count and a dropped name reddens exactly like a wrong one.
    expect(swap({ changelog: fixture("violating", "changelog-unnamed-member.md") })).toContain(
      "the `spine-2` teachability finding does not state the measured `TypeScript 0/10 — inferred: `arm`, `name`, `register`, `view``",
    );
  });

  it("REJECTS a TypeScript deficit paid off by the KOTLIN sentence", () => {
    // The cross-port leak, measured on this repository's own receipt before the
    // literal existed: `register`, `arm` and `view` are named in BOTH ports'
    // findings, so a per-name substring search over one note let the TypeScript
    // half shrink to almost nothing in silence. The port label lives inside the
    // literal now, so a Kotlin sentence cannot pay a TypeScript debt.
    const problems = swap({
      changelog: fixture("violating", "changelog-receipt-name-attribution.md"),
    });
    expect(problems).toContain(
      "the `spine-2` teachability finding does not state the measured `TypeScript 0/10 — inferred: `arm`, `name`, `register`, `view``",
    );
    expect(problems).not.toContain(
      "the `spine-2` teachability finding does not state the measured `Kotlin 4/8 — inferred: `register``",
    );
  });

  it("REJECTS a finding whose VERDICT the census does not support", () => {
    // Both fractions right, every owed name present, and the reading inverted.
    // This passed — measured, on the live tree, with the full gate green — until
    // the verdict was derived from the same census as the numbers.
    const problems = swap({ changelog: fixture("violating", "changelog-softened-verdict.md") });
    expect(problems).toContain(
      "the `spine-2` teachability finding states no verdict the census supports: it owes `*not* yet sufficient`",
    );
    expect(problems).toContain(
      "the `spine-2` teachability finding claims `sufficient in both ports`, which the census contradicts",
    );
  });

  it("REJECTS a finding satisfied from OUTSIDE its own heading", () => {
    // The scoping case. Every literal the receipt owes appears in the entry —
    // just not under the heading — and the run itself was skipped.
    const problems = swap({ changelog: fixture("violating", "changelog-receipt-elsewhere.md") });
    expect(problems).toContain(
      "the `spine-2` teachability finding does not state the measured `TypeScript 0/10 — inferred: `arm`, `name`, `register`, `view``",
    );
    expect(problems).toContain(
      "the `spine-2` teachability finding does not state the measured `Kotlin 4/8 — inferred: `register``",
    );
  });
});

describe("the teachability census ALLOWS a run that happened", () => {
  it("passes the compliant set in silence", () => {
    expect(teachabilityProblems(COMPLIANT)).toEqual([]);
  });

  it("the compliant set is a REAL census, not a corpus that reports nothing", () => {
    // The allow half's own anti-vacuity guard: a compliant fixture set the
    // reader silently failed on would also pass in silence, so the numbers the
    // set produces are asserted too.
    const facades = readFacades(COMPLIANT.sources).filter(
      (facade): facade is Facade => facade !== null,
    );
    expect(facades.length).toBe(4);
    expect(receiptLine("typescript", censusOf(facades, "typescript"))).toBe(
      "TypeScript 0/10 — inferred: `arm`, `name`, `register`, `view`",
    );
    expect(receiptLine("kotlin", censusOf(facades, "kotlin"))).toBe(
      "Kotlin 4/8 — inferred: `register`",
    );
  });

  it("reads only the facade's OWN keys — a nested table's keys are not members", () => {
    // `beta`'s handler table declares `SendBeta` and `DropBeta` at brace depth
    // two. A depth-blind reader would count them and inflate the surface, which
    // is a port that looks LESS teachable than it is — the mirror error, equally
    // wrong, and the one a line-oriented regex makes.
    const beta = tsFacade("typescript", "beta", "beta", fixture("compliant", "ts-beta.txt"));
    expect(beta?.members.map((member) => member.name)).toEqual([
      "name",
      "register",
      "handlers",
      "arm",
      "view",
      "sliceOf",
    ]);
    // …and the Kotlin mirror: `performer`'s `when` branches are not members.
    const ktBeta = ktFacade("kotlin", "beta", "beta", fixture("compliant", "kt-beta.txt"));
    expect(ktBeta?.members.map((member) => member.name)).toEqual([
      "register",
      "performer",
      "arm",
      "view",
      "contextLines",
    ]);
    // …and a private field is not surface at all.
    const ktAlpha = ktFacade("kotlin", "alpha", "alpha", fixture("compliant", "kt-alpha.txt"));
    expect(ktAlpha?.members.map((member) => member.name)).toEqual(["register", "arm", "view"]);
  });

  it("reads a PRIMARY-CONSTRUCTOR property as surface — and only when it is one", () => {
    // A `val` in the primary constructor is a public property: an implementer
    // has to know it, so the census has to see it. It was invisible while the
    // header was read by one regex, and the failure direction was FLATTERING —
    // a smaller surface is a better score — which is the direction this module
    // exists to refuse. `private val` is not surface; a bare parameter declares
    // no property and is not surface either; the language's own `val`/`var`
    // keyword is the whole test, so no spelling has to be enumerated.
    expect(
      ktFacade("kotlin", "alpha", "alpha", fixture("compliant", "kt-ctor-property.txt"))?.members,
    ).toEqual([
      { name: "maxTickets", pinned: false },
      { name: "register", pinned: false },
      { name: "arm", pinned: true },
      { name: "view", pinned: true },
    ]);
  });

  it("crosses a constructor default that carries its own parentheses", () => {
    // `val armImpl: Arm = EscalationArm(),` — the nested `)` that no `[^)]*`
    // can cross. The old header regex failed to match at all here, which read as
    // "no block facade found": fail-closed by accident rather than by design,
    // and one legal default value away from a block the census could not see.
    expect(
      ktFacade("kotlin", "alpha", "alpha", fixture("compliant", "kt-ctor-nested-paren.txt"))
        ?.members,
    ).toEqual([
      { name: "armImpl", pinned: false },
      { name: "register", pinned: false },
      { name: "arm", pinned: true },
    ]);
  });

  it("does not credit `Any`'s own members as contract coverage", () => {
    // `override fun toString()` is `override` in the language's eyes and says
    // nothing about the block contract. It stays a MEMBER — an implementer does
    // see it — with the credit withheld, so the port's coverage fraction counts
    // only roles a block author was actually taught.
    expect(
      ktFacade("kotlin", "alpha", "alpha", fixture("compliant", "kt-override-any-member.txt"))
        ?.members,
    ).toEqual([
      { name: "register", pinned: false },
      { name: "arm", pinned: true },
      { name: "toString", pinned: false },
    ]);
  });

  it("does not desynchronise on a template literal's interpolation hole", () => {
    // A backtick inside a `${…}` hole closes the string for a naive scanner,
    // and everything after it is read as the wrong kind of text. The members it
    // then drops make the port look MORE teachable, so this is the flattering
    // direction again — caught here by asserting that all three are still read.
    expect(
      tsFacade(
        "typescript",
        "alpha",
        "alpha",
        fixture("compliant", "ts-template-hole.txt"),
      )?.members.map((member) => member.name),
    ).toEqual(["name", "arm", "view"]);
  });
});
