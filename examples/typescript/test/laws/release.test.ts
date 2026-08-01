// ── THE RELEASE CHECK'S OWN BLOCK-TEST AND ALLOW-TEST ─────────────────────
//
// 15.2's bar, applied to the release check: the pure function in release.ts is
// run against checked-in VIOLATING inputs it must reject case by case, and a
// COMPLIANT set it must pass in silence. Every rejection below is asserted by
// its own named case against its own specific message — never "problems is
// non-empty" — so weakening one predicate goes red on its own.
//
// THE LIVE HALF IS THE POINT, and it is what stops this going the way C7's
// derivation went. The fixtures are frozen text; the live cases below read the
// SHIPPED marker files and compare the text the regex extracts against the value
// the module actually exports. Rename the constant and the extraction reports a
// MISSING marker rather than silently matching nothing, and the runtime
// comparison goes red at the same time. A frozen-fixture-only version of this
// file would stay green while the rule stopped binding to anything.
//
// AND THE COMPLIANT SET IS DELIBERATELY TWO CORPORA, NOT ONE. A single-entry
// CHANGELOG is the easiest thing to be accidentally right about: a rule pinned
// to "the log holds exactly this one heading" passes every case a one-entry tree
// can present and turns red on the FIRST release the ritual prescribes. So the
// second compliant corpus is a real two-entry log at `spine-2`, and the rules
// below are stated as RELATIONSHIPS to the marker — newest heading equals it,
// entry count equals its ordinal — which hold at every future value.
//
// The fixture corpora are plain `.txt` and `.md` rather than real `.ts` and
// `.kt`: this checker keys on the text of a declaration and not on a file
// extension, so giving them source extensions would buy nothing and cost three
// build-config exclusions (tsconfig, biome, eslint) that the citation lint's
// fixtures need only because that lint reads extensions.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../../src/spine/pure/step-record";
import { SPINE_VERSION } from "../../src/spine/pure/version";
import { harness } from "../harness";
import {
  declaredMarker,
  entries,
  headings,
  KT_DECLARATION,
  MARKER_FORM,
  MIGRATION_NOTE,
  markerOrdinal,
  ORACLES,
  PRACTICES,
  type ReleaseCorpus,
  releaseProblems,
  TS_DECLARATION,
} from "./release";

const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, "..", "..", "..", "..");

/** THE FOUR PATHS, PINNED. Both markers sit INSIDE their port's vendored unit —
 *  `examples/typescript/src/spine/` and `examples/kotlin/spine/` — which is the
 *  property that makes `cp -r` carry them. A marker parked beside the vendored
 *  tier instead of inside it is a marker an adopter never receives. */
const TS_MARKER_PATH = "examples/typescript/src/spine/pure/version.ts";
const KT_MARKER_PATH = "examples/kotlin/spine/src/main/kotlin/adr/spine/pure/Version.kt";
const CHANGELOG_PATH = "CHANGELOG.md";
const RITUAL_PATH = "RELEASE-RITUAL.md";

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const liveTsSource = read(TS_MARKER_PATH);
const liveKtSource = read(KT_MARKER_PATH);

const live: ReleaseCorpus = {
  tsMarkerSource: liveTsSource,
  ktMarkerSource: liveKtSource,
  changelog: read(CHANGELOG_PATH),
  ritual: read(RITUAL_PATH),
};

describe("the release is coherent — the marker and the CHANGELOG move together", () => {
  it("the LIVE tree passes every rule", () => {
    expect(releaseProblems(live)).toEqual([]);
  });

  it("reads the LIVE marker, not a copy — the text and the exported value agree", () => {
    // The anti-vacuity assertion. The checker extracts a string out of source
    // TEXT; this is what proves the text it extracted is the value the program
    // actually runs on, so a marker file that declares one thing and exports
    // another cannot pass.
    expect(declaredMarker(TS_DECLARATION, liveTsSource)).toBe(SPINE_VERSION);
    expect(declaredMarker(KT_DECLARATION, liveKtSource)).toBe(SPINE_VERSION);
    expect(MARKER_FORM.test(SPINE_VERSION)).toBe(true);
  });

  it("PINS THE PREDICATES — a weakened extraction is a visible diff, not a silence", () => {
    expect(MARKER_FORM.source).toBe("^spine-([1-9]\\d*)$");
    expect(TS_DECLARATION.source).toBe('^export const SPINE_VERSION = "([^"]*)";$');
    expect(KT_DECLARATION.source).toBe('^const val SPINE_VERSION = "([^"]*)"$');
    expect(MIGRATION_NOTE).toBe("**Migrating to it:**");
    expect([...ORACLES]).toEqual([
      "cd examples/typescript && npm test",
      "cd examples/kotlin && ./gradlew --console=plain test --rerun-tasks",
    ]);
    // The five practices the campaign that produced this tree measurably ran.
    // Pinned as literals for the same reason the oracles are: dropping one from
    // the ritual has to be a diff a reviewer sees, in BOTH files.
    expect([...PRACTICES]).toEqual([
      "premise",
      "split stances",
      "Adjudicate mechanically",
      "Repair forward",
      "Prove it can fail",
    ]);
  });

  it("both markers sit INSIDE the vendored unit, so a copy carries them", () => {
    expect(TS_MARKER_PATH.startsWith("examples/typescript/src/spine/")).toBe(true);
    expect(KT_MARKER_PATH.startsWith("examples/kotlin/spine/")).toBe(true);
  });

  it("the CHANGELOG's newest entry IS the marker, and the log is as long as its ordinal", () => {
    // A RELATIONSHIP, never a snapshot of today's log. `toEqual([SPINE_VERSION])`
    // would say "there is exactly one entry, forever" — green today and red on
    // the first correct release this repository's own ritual prescribes, which
    // is a check that cannot survive the process it enforces. These three hold
    // at every marker value, and they are EQUALITIES: `length >= 1` would buy
    // back the silence.
    const log = headings(live.changelog);
    expect(log[0]).toBe(SPINE_VERSION);
    expect(log.length).toBe(markerOrdinal(SPINE_VERSION));
    expect(new Set(log).size).toBe(log.length);
  });

  it("every LIVE entry states its migration — the body, not just the heading", () => {
    const log = entries(live.changelog);
    expect(log.length).toBeGreaterThan(0);
    for (const entry of log) {
      expect(entry.body, entry.key).toContain(MIGRATION_NOTE);
    }
  });
});

// ── the three versions the ratified record refuses to merge ───────────────
// Asserted by READING all three from their three real homes rather than by a
// comment claiming they are separate. A tree that merged any two would have to
// make one of these assertions false.
const ENVELOPE_HOME = "examples/typescript/src/spine/pure/step-record.ts";
const REDUCER_HOME = "examples/typescript/src/app/wire.ts";

describe("three versions, three homes, three values", () => {
  const app = harness().app;

  it("each is DECLARED in its own file, and the three files are three", () => {
    expect(new Set([TS_MARKER_PATH, ENVELOPE_HOME, REDUCER_HOME]).size).toBe(3);
    expect(read(ENVELOPE_HOME)).toMatch(/^export const SCHEMA_VERSION = \d+;$/m);
    // A LOCATION assertion, not an expression one. The item asks where each
    // version lives; binding this case to one right-hand side's spelling in
    // wire.ts would redden on a legitimate refactor that moved nothing.
    expect(read(REDUCER_HOME)).toMatch(/\breducerVersion\b/);
    // …and the marker's home does not DERIVE the marker from either of them: a
    // merge would have to put one of those names on this file's right-hand side.
    // Scoped honestly — it refuses a non-literal right-hand side on the
    // declaration line, which is the spelling a merge would need.
    expect(liveTsSource).not.toMatch(/^export const SPINE_VERSION = [^"]/m);
  });

  it("they are not even the same kind of thing, let alone the same value", () => {
    expect(typeof SPINE_VERSION).toBe("string");
    expect(typeof SCHEMA_VERSION).toBe("number");
    expect(typeof app.reducerVersion).toBe("string");
    expect(app.reducerVersion).not.toBe(SPINE_VERSION);
    expect(String(SCHEMA_VERSION)).not.toBe(SPINE_VERSION);
  });

  it("a FOURTH identifier exists in the app and is not in that argument", () => {
    // The prompt version is app-owned like the reducer version, and is a
    // captured audit fixture rather than a compatibility number. It is asserted
    // here so a reader counting "the three versions" does not conclude the tree
    // holds exactly three version-shaped strings: it holds four, and only the
    // first three are the ones the record refuses to merge.
    const wire = read(REDUCER_HOME);
    expect(wire).toMatch(/\bpromptVersion\b/);
    expect(wire).toMatch(/\breducerVersion\b/);
  });
});

// ── the block-test: every rule red on its own case ────────────────────────
const fixture = (half: string, name: string): string =>
  readFileSync(join(HERE, "fixtures", "release", half, name), "utf8");

const COMPLIANT: ReleaseCorpus = {
  tsMarkerSource: fixture("compliant", "ts-version.txt"),
  ktMarkerSource: fixture("compliant", "kt-version.txt"),
  changelog: fixture("compliant", "changelog.md"),
  ritual: fixture("compliant", "ritual.md"),
};

/** THE SECOND COMPLIANT CORPUS: a real second release. Both markers at
 *  `spine-2`, a two-entry log newest-first, each entry carrying its own
 *  migration note. Every rule that reads the log has to hold HERE too, which is
 *  the property a one-entry fixture set cannot test. */
const COMPLIANT_TWO: ReleaseCorpus = {
  tsMarkerSource: fixture("violating", "ts-version-bumped.txt"),
  ktMarkerSource: fixture("violating", "kt-version-bumped.txt"),
  changelog: fixture("compliant", "changelog-two-entries.md"),
  ritual: fixture("compliant", "ritual.md"),
};

/** One swap at a time, so each case names exactly what it broke. */
const swap = (patch: Partial<ReleaseCorpus>): string[] =>
  releaseProblems({ ...COMPLIANT, ...patch });

describe("the release check DENIES an incoherent release", () => {
  it("REJECTS the headline failure: the marker moved and the CHANGELOG did not", () => {
    // FIXTURE A of the pair the whole check exists for. Both ports bumped to
    // spine-2 against a CHANGELOG whose newest entry is still spine-1.
    expect(
      swap({
        tsMarkerSource: fixture("violating", "ts-version-bumped.txt"),
        ktMarkerSource: fixture("violating", "kt-version-bumped.txt"),
      }),
    ).toContain(
      "the CHANGELOG's newest entry is `spine-1` but the spine version marker is `spine-2`",
    );
  });

  it("REJECTS the MIRROR of it: the entry was written and the marker left behind", () => {
    // From the TWO-ENTRY compliant base, not the one-entry one — the direction
    // a single-entry fixture set cannot express, because there is no earlier
    // marker for the tree to be stuck at.
    expect(
      releaseProblems({
        ...COMPLIANT_TWO,
        tsMarkerSource: fixture("compliant", "ts-version.txt"),
        ktMarkerSource: fixture("compliant", "kt-version.txt"),
      }),
    ).toContain(
      "the CHANGELOG's newest entry is `spine-2` but the spine version marker is `spine-1`",
    );
  });

  it("REJECTS a TypeScript marker that was renamed out of existence", () => {
    expect(swap({ tsMarkerSource: fixture("violating", "ts-version-renamed.txt") })).toContain(
      "the TypeScript spine declares no SPINE_VERSION marker",
    );
  });

  it("REJECTS a Kotlin marker that was renamed out of existence", () => {
    expect(swap({ ktMarkerSource: fixture("violating", "kt-version-renamed.txt") })).toContain(
      "the Kotlin spine declares no SPINE_VERSION marker",
    );
  });

  it("REJECTS two ports that disagree about which revision they are", () => {
    expect(swap({ ktMarkerSource: fixture("violating", "kt-version-bumped.txt") })).toContain(
      "the two ports' spine version markers disagree: spine-1 (ts) vs spine-2 (kt)",
    );
  });

  it("REJECTS a registry-shaped version where the marker belongs", () => {
    expect(
      swap({
        tsMarkerSource: fixture("violating", "ts-version-malformed.txt"),
        ktMarkerSource: fixture("violating", "kt-version-malformed.txt"),
      }),
    ).toContain("the spine version marker `1.0.0` is not spelled `spine-<n>`");
  });

  it("REJECTS a CHANGELOG with no entry at all", () => {
    expect(swap({ changelog: fixture("violating", "changelog-empty.md") })).toContain(
      "the CHANGELOG carries no entry, so no marker value can be migrated from",
    );
  });

  it("REJECTS an entry keyed on a date instead of the marker", () => {
    expect(swap({ changelog: fixture("violating", "changelog-dated.md") })).toContain(
      "the CHANGELOG heading `2026-07-31` is not a marker value",
    );
  });

  it("REJECTS two entries under one key", () => {
    expect(
      swap({
        changelog: fixture("violating", "changelog-duplicate.md"),
        tsMarkerSource: fixture("violating", "ts-version-bumped.txt"),
        ktMarkerSource: fixture("violating", "kt-version-bumped.txt"),
      }),
    ).toContain("the CHANGELOG repeats the entry `spine-2`");
  });

  it("REJECTS entries that are not newest-first", () => {
    expect(
      swap({
        changelog: fixture("violating", "changelog-unordered.md"),
        tsMarkerSource: fixture("violating", "ts-version-bumped.txt"),
        ktMarkerSource: fixture("violating", "kt-version-bumped.txt"),
      }),
    ).toContain("the CHANGELOG's entries are not newest-first");
  });

  it("REJECTS a skipped number, which claims history nobody wrote", () => {
    expect(swap({ changelog: fixture("violating", "changelog-gap.md") })).toContain(
      "the newest entry is `spine-5` but the CHANGELOG holds 1 entries — the numbering is contiguous",
    );
  });

  it("REJECTS an entry that describes a change and never says what to DO", () => {
    // The heading is well-formed, newest-first, contiguous and agrees with the
    // marker: every rule that reads headings passes it. Only the body is
    // missing, and the body is the entire point for a tier no registry ships.
    expect(swap({ changelog: fixture("violating", "changelog-no-migration.md") })).toContain(
      "the CHANGELOG entry `spine-1` states no migration note",
    );
  });

  it("REJECTS a ritual that has stopped naming its oracle", () => {
    const problems = swap({ ritual: fixture("violating", "ritual-silent.md") });
    for (const oracle of ORACLES) {
      expect(problems).toContain(`the release ritual does not name its oracle: \`${oracle}\``);
    }
  });

  it("REJECTS a ritual that kept its oracles and dropped the practices", () => {
    // The hole a reviewer proved executably: the two oracle fences can survive a
    // rewrite that deletes the whole loop, and nothing was reading the steps. A
    // document is not a ritual; these five are what the campaign ran.
    const problems = swap({ ritual: fixture("violating", "ritual-no-practices.md") });
    for (const practice of PRACTICES) {
      expect(problems).toContain(
        `the release ritual no longer names the practice: \`${practice}\``,
      );
    }
    // …and it is not passing by accidentally failing the oracle rule instead.
    for (const oracle of ORACLES) {
      expect(problems).not.toContain(`the release ritual does not name its oracle: \`${oracle}\``);
    }
  });
});

describe("the release check ALLOWS a coherent release", () => {
  it("passes the compliant set in silence", () => {
    expect(releaseProblems(COMPLIANT)).toEqual([]);
  });

  it("passes a SECOND release in silence — the rule survives its own ritual", () => {
    // The case the shipped tree cannot supply and the repair exists for: two
    // entries, marker at spine-2, everything coherent. If any rule here were a
    // snapshot of the one-entry log rather than a relationship, this is where it
    // would go red.
    expect(releaseProblems(COMPLIANT_TWO)).toEqual([]);
    expect(headings(COMPLIANT_TWO.changelog)).toEqual(["spine-2", "spine-1"]);
    expect(markerOrdinal("spine-2")).toBe(2);
  });
});
