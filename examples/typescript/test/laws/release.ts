// ── THE RELEASE CHECK — the marker and the CHANGELOG cannot drift apart ────
//
// The spine is vendored source, never a published package (1.3). A vendored copy
// therefore has exactly one way to learn that upstream moved: read its own spine
// version marker, find the CHANGELOG entries above it, apply them. Three
// failures break that mechanism silently, and all three have to be impossible
// rather than discouraged:
//
//   · THE MARKER MOVES WITHOUT AN ENTRY. The copy is told it is behind and given
//     nothing to do about it. That is the "template-abandoned" end state the
//     marker exists to prevent, arrived at through the marker itself.
//   · THE TWO PORTS DISAGREE. One architecture, two vendored spellings — a
//     CHANGELOG entry that means one thing to a TypeScript adopter and another
//     to a Kotlin one is worse than no entry, because both readers trust it.
//   · AN ENTRY CARRIES NO MIGRATION NOTE. The heading answers "am I behind?";
//     only the BODY answers "what do I do about it?", which is the whole reason
//     the log exists for a tier nothing installs. An entry that describes a
//     change and stops is a receipt, not a migration.
//
// This module is the PURE half, on the citation lint's exact shape: it takes the
// four texts and reports problems, so the SAME function judges the live tree and
// a checked-in violating/compliant pair. 15.2's bar applies to it like every
// other check here — the pair in release.test.ts proves each rule red and the
// whole set green, and the live half feeds it the marker files' real text rather
// than a copy, so renaming the constant reports a MISSING marker instead of
// going quietly vacuous.
//
// IT IS DELIBERATELY NOT A NEW LAW. The invariant registry is closed and 16.4's
// bar for reopening it — a named production failure — is not met by a
// bookkeeping rule. It is a gated test, wired into `npm test` like the citation
// lint, which is the precedent it copies.

/** The four texts a release is judged on. Paths live in release.test.ts; this
 *  half never touches the disk, which is what makes the fixtures possible. */
export interface ReleaseCorpus {
  /** `src/spine/pure/version.ts`, verbatim. */
  readonly tsMarkerSource: string;
  /** `spine/src/main/kotlin/adr/spine/pure/Version.kt`, verbatim. */
  readonly ktMarkerSource: string;
  /** `CHANGELOG.md`, verbatim. */
  readonly changelog: string;
  /** `RELEASE-RITUAL.md`, verbatim. */
  readonly ritual: string;
}

/** The marker's SPELLING, pinned. Contiguous and ordinal, so `spine-4` asserts
 *  four entries have ever been written and a skipped number is a claim about
 *  history nobody wrote. No leading zero, because `spine-01` and `spine-1` would
 *  be two keys for one release. */
export const MARKER_FORM = /^spine-([1-9]\d*)$/;

/** The two declarations, one per port. Anchored to the whole line so a mention
 *  in a comment is not mistaken for the declaration. */
export const TS_DECLARATION = /^export const SPINE_VERSION = "([^"]*)";$/m;
export const KT_DECLARATION = /^const val SPINE_VERSION = "([^"]*)"$/m;

/** Every `##` heading in the CHANGELOG — ALL of them, not the ones that happen
 *  to look like markers. A heading keyed on a date is the drift this catches. */
export const HEADING = /^##[ \t]+(.*\S)[ \t]*$/gm;

/** The literal an entry's BODY must carry. It is a fixed spelling rather than a
 *  fuzzy "mentions migration" because the rule has to be answerable by an
 *  author: write this heading, say what to do under it — including "nothing to
 *  do", which IS an answer. The heading alone tells an adopter it is behind;
 *  only the body tells it what to do, and for a tier no registry publishes
 *  there is nothing else that can. */
export const MIGRATION_NOTE = "**Migrating to it:**";

/** The commands that settle a dispute, asserted as literals. A ritual document
 *  that stops naming its oracle is a ritual with no adjudicator, and the loop it
 *  describes degrades into argument — so the prose is checked for exactly this
 *  much. `--rerun-tasks` is load-bearing: a Gradle green over up-to-date tasks
 *  proves that nothing ran. */
export const ORACLES = [
  "cd examples/typescript && npm test",
  "cd examples/kotlin && ./gradlew --console=plain test --rerun-tasks",
] as const;

/** The five practices the loop that produced this tree actually ran, each one a
 *  literal the ritual document has to keep naming. The oracle pair alone left
 *  the seven-step loop deletable in silence — measured: gutting every step to
 *  one sentence kept this check quiet — and a ritual whose steps can vanish
 *  without a red build is a document, not a ritual. These five are the practices
 *  the campaign measurably ran, so they are the five that are pinned; rewording
 *  a step is free, dropping the practice it names is not. */
export const PRACTICES = [
  "premise",
  "split stances",
  "Adjudicate mechanically",
  "Repair forward",
  "Prove it can fail",
] as const;

/** The marker a port DECLARES, or null when it declares none. Null rather than
 *  an empty string on purpose: "" would compare equal to another "" and two
 *  renamed constants would agree with each other about nothing. */
export function declaredMarker(pattern: RegExp, source: string): string | null {
  const found = pattern.exec(source);
  return found?.[1] ?? null;
}

/** The CHANGELOG's headings, newest first, in document order. */
export function headings(changelog: string): string[] {
  return [...changelog.matchAll(HEADING)].map((m) => (m[1] ?? "").trim());
}

/**
 * The CHANGELOG's entries — heading key plus the BODY under it, which is the
 * text from the end of that heading line to the next heading or the end of the
 * file. Nothing else in this module reads a body; this is the one splitter, so
 * the per-entry rule below and the test that drives it cannot disagree about
 * where an entry ends.
 */
export function entries(changelog: string): { key: string; body: string }[] {
  const marks = [...changelog.matchAll(HEADING)];
  return marks.map((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const next = marks[index + 1];
    const end = next?.index ?? changelog.length;
    return { key: (mark[1] ?? "").trim(), body: changelog.slice(start, end) };
  });
}

/** The ordinal a marker value asserts — `spine-4` is 4 — or null when the value
 *  is not spelled as a marker at all. Exported because the test derives the
 *  CHANGELOG's expected length from the SAME function the rule uses; a second
 *  hand-written `slice(6)` in the test would be a second thing to keep true. */
export function markerOrdinal(marker: string): number | null {
  const found = MARKER_FORM.exec(marker);
  return found ? Number(found[1]) : null;
}

/**
 * Every way a release can be incoherent, as one list of sentences. Empty is the
 * only passing result; each rule is asserted on its own case by release.test.ts,
 * so weakening one goes red on its own rather than hiding behind another.
 */
export function releaseProblems(corpus: ReleaseCorpus): string[] {
  const problems: string[] = [];

  const ts = declaredMarker(TS_DECLARATION, corpus.tsMarkerSource);
  const kt = declaredMarker(KT_DECLARATION, corpus.ktMarkerSource);
  if (ts === null) problems.push("the TypeScript spine declares no SPINE_VERSION marker");
  if (kt === null) problems.push("the Kotlin spine declares no SPINE_VERSION marker");
  if (ts !== null && kt !== null && ts !== kt) {
    problems.push(`the two ports' spine version markers disagree: ${ts} (ts) vs ${kt} (kt)`);
  }

  const marker = ts ?? kt;
  if (marker !== null && markerOrdinal(marker) === null) {
    problems.push(`the spine version marker \`${marker}\` is not spelled \`spine-<n>\``);
  }

  const log = entries(corpus.changelog);
  if (log.length === 0) {
    problems.push("the CHANGELOG carries no entry, so no marker value can be migrated from");
  }
  for (const entry of log) {
    if (markerOrdinal(entry.key) === null) {
      problems.push(`the CHANGELOG heading \`${entry.key}\` is not a marker value`);
    }
  }
  const seen = new Set<string>();
  for (const entry of log) {
    if (seen.has(entry.key)) problems.push(`the CHANGELOG repeats the entry \`${entry.key}\``);
    seen.add(entry.key);
  }
  // THE BODY, not just the heading. 1.3's consequence in one predicate: the log
  // exists so a copy at the previous marker knows what to DO, and that lives
  // under the migration heading or nowhere.
  for (const entry of log) {
    const at = entry.body.indexOf(MIGRATION_NOTE);
    if (at < 0) {
      problems.push(`the CHANGELOG entry \`${entry.key}\` states no migration note`);
      continue;
    }
    // THE HEADING IS NOT THE NOTE. A substring test is satisfied by the literal
    // heading with nothing under it, which is exactly what the ritual says is
    // impossible: "an entry that describes a change without saying what a copy
    // at the previous marker must do has not done its job". So the SECTION is
    // read — everything to the next `**…**` heading or the entry's end — and it
    // has to say something. EMPTINESS is the whole test and a length threshold
    // is deliberately NOT: "nothing to do." is a complete and correct migration
    // note for a release that needs none, and a rule that called it too short
    // would be the nuisance §15.2 warns about — measured, a 20-character bar
    // reddened exactly that legitimate entry in this file's own fixtures.
    const rest = entry.body.slice(at + MIGRATION_NOTE.length);
    const next = /\n\s*\*\*[^*]+\*\*/.exec(rest);
    const note = (next === null ? rest : rest.slice(0, next.index)).trim();
    if (note.length === 0) {
      problems.push(
        `the CHANGELOG entry \`${entry.key}\` carries the migration HEADING with no note under it`,
      );
    }
  }

  const newest = log[0]?.key;
  if (newest !== undefined && marker !== null && newest !== marker) {
    problems.push(
      `the CHANGELOG's newest entry is \`${newest}\` but the spine version marker is \`${marker}\``,
    );
  }

  const ordinals: number[] = [];
  for (const entry of log) {
    const n = markerOrdinal(entry.key);
    if (n !== null) ordinals.push(n);
  }
  if (ordinals.length === log.length && ordinals.length > 0) {
    let descending = true;
    let previous = Number.POSITIVE_INFINITY;
    for (const n of ordinals) {
      if (n >= previous) descending = false;
      previous = n;
    }
    if (!descending) problems.push("the CHANGELOG's entries are not newest-first");
    const [top] = ordinals;
    if (top !== undefined && top !== ordinals.length) {
      problems.push(
        `the newest entry is \`spine-${top}\` but the CHANGELOG holds ${ordinals.length} entries — the numbering is contiguous`,
      );
    }
  }

  for (const oracle of ORACLES) {
    if (!corpus.ritual.includes(oracle)) {
      problems.push(`the release ritual does not name its oracle: \`${oracle}\``);
    }
  }
  for (const practice of PRACTICES) {
    if (!corpus.ritual.includes(practice)) {
      problems.push(`the release ritual no longer names the practice: \`${practice}\``);
    }
  }

  return problems;
}
