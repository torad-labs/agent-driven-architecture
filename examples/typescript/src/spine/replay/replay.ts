// ── spine/replay/replay — a LIVE run against its REPLAY (G9) ───────────────
// The shipped harness folded the same in-memory array twice through a pure
// function and asserted the two were equal. That is f(x) == f(x): true by
// definition, and measured to catch nothing — an impure tool that read a
// mutable global and performed a side effect passed it, because the harness
// never invoked a tool at all.
//
// What replays here is the COMMITTED BYTES, and what they are compared against
// is what a LIVE boundary actually did:
//
//   refold(initial, records, dispatchers)     re-derive state + the FULL keyed
//                                             effect sequence, timestamps and
//                                             keys included, from the bus alone
//   stateAtStep(..., k)                       THE SCRUB: the same re-fold over
//                                             the PREFIX ending at k — what the
//                                             system believed at that moment
//   collectPerform(..., mode)                 drive the perform seam in REPLAY
//                                             (collect, touch nothing) or in
//                                             RECOVERY (re-drive, deduped)
//   contextDivergence(...)                    re-derive each step's context
//                                             digest and compare it to the
//                                             fixture the step committed
//
// What REPLAY buys, exactly (14.1.1): determinism over a RECORDED TIMELINE —
// forensics, audit, production-traces-as-fixtures. NOT behavioural
// reproducibility: re-running the model is not deterministic, and inputs that
// were conflated away were never recorded. What IS guaranteed is that the run
// that WAS recorded re-derives exactly, bit for bit, from its own committed
// bytes.

import type { PerformMode, Sink } from "../ports/sink";
import { render } from "../pure/context";
import type { EffectBase } from "../pure/effect";
import type { SourceKey, Timestamp } from "../pure/ids";
import type { KeyedEffect } from "../pure/keyed-effect";
import { keyedEffect } from "../pure/keyed-effect";
import { isPerceived } from "../pure/staged";
import type { StepRecord } from "../pure/step-record";
import type { ToolResultBase } from "../pure/tool-result";
import type { Dispatchers } from "../pure/verb";

export interface Refolded<S> {
  readonly state: S;
  readonly effects: readonly KeyedEffect<EffectBase>[];
}

/** Re-fold ONLY the committed bytes. `now` comes off the record (G9); the
 *  effect key comes off the record's position, which is exactly the committed
 *  step index the live boundary keyed with (G9). */
export function refold<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
): Refolded<S> {
  let state = initial;
  const effects: KeyedEffect<EffectBase>[] = [];
  records.forEach((record, step) => {
    const out = dispatchers.fold(state, record.results, record.now, record.sig);
    state = out.state;
    out.effects.forEach((effect, index) => effects.push(keyedEffect(step, index, effect)));
  });
  return { state, effects };
}

/** THE SCRUB (14.1): what the system believed at step `k`, re-derived from the
 *  prefix of the timeline that ends there and from nothing else. The book's own
 *  equation names this operation `stateAtStep`, so the port spells it the same
 *  way rather than inventing a second word for it; the playhead a UI drags is
 *  the caller's, and this is the only part of it that is architecture.
 *
 *  It returns the same `Refolded` shape as [refold] deliberately. The effects a
 *  prefix produced are half of "what the system believed at k" — a scrub that
 *  shows state and hides the on-call page it had already sent is a lie of
 *  omission — and they are keyed off each record's own position, so a prefix
 *  re-fold's keys are the same keys the live run wrote.
 *
 *  `k` is clamped by SLICING, never by throwing. The pure ring does not raise
 *  on a caller's arithmetic, and a playhead dragged past either end of a
 *  timeline is a UI event, not a fault: below zero yields the initial state,
 *  beyond the end yields the whole timeline — and BOTH ends are asserted, at
 *  an interior k and at the right edge, in test/spine/replay.test.ts.
 *
 *  Nothing is memoized and nothing is versioned here. This IS the fold; a
 *  bounded-cost memo of a prefix, and whatever marker would make such a memo
 *  trustworthy, is a separate concern with a decision of its own. */
export function stateAtStep<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
  k: number,
): Refolded<S> {
  return refold(initial, records.slice(0, Math.max(0, k)), dispatchers);
}

/** Drive the perform seam over a committed timeline. In REPLAY the sink must
 *  touch nothing; in RECOVERY a deduping sink drops anything already
 *  acknowledged, so re-driving after a crash is idempotent. */
export function collectPerform<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
  sink: Sink,
  mode: PerformMode,
): void {
  refold(initial, records, dispatchers).effects.forEach((keyed) => sink.perform(keyed, mode));
}

/** The durable dedupe scope, re-derived from the bus alone (12.2): every
 *  source key a committed step consumed. The key rides the committed
 *  `Perceived` fixture for exactly this reason — a restarted consumer is
 *  seeded with these, so redelivered work that already committed is refused
 *  instead of folded twice. Work that never committed leaves no key here and
 *  is retried, which is the other half of the same contract. */
export function committedSourceKeys(records: readonly StepRecord[]): readonly SourceKey[] {
  return records.flatMap((record) => record.staged.filter(isPerceived).map((p) => p.key));
}

/** G15: the committed context digest must be re-derivable from committed
 *  State. A change to `projectContext` that silently alters what the model saw
 *  fails HERE — without re-running the model. */
export function contextDivergence<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
): readonly string[] {
  let state = initial;
  const problems: string[] = [];
  records.forEach((record, step) => {
    const digest = render(dispatchers.projectContext(state, record.staged));
    if (digest !== record.context.digest) {
      problems.push(`step ${step}: context digest diverged`);
    }
    state = dispatchers.fold(state, record.results, record.now, record.sig).state;
  });
  return problems;
}

// ── SNAPSHOT — a memoized fold prefix, and a tag that can REFUSE (14.1) ────
// Folding from genesis on every restart, scrub or recovery is O(timeline), and
// the deployments this architecture most recommends — a server agent, an
// ambient assistant — run indefinitely. 14.1's steel note gives the
// purity-preserving extension and its equation:
//
//     fold(snapshot@k, timeline[k..])  ==  fold(initialState, timeline)
//
// …and the rule that keeps it honest: tag every snapshot with the REDUCER
// VERSION and the TIMELINE OFFSET it covers, because a snapshot taken under an
// old reducer is untrustworthy under a new one (14.7).
//
// A TAG THAT IS ONLY CARRIED IS DECORATION — and an integer cannot police
// itself. Take the ONLY resume site a STORED snapshot permits: a reader holds a
// snapshot blob and a log, and nothing else in this system knows which prefix
// that blob covers, because `StepRecord` carries no step index. So the reader
// must ask the log for the tail at `snapshot.tag.offset`, and any check of the
// form `tag.offset === tail.from` is then `x === x`. Corrupt the integer and
// the wrong tail folds into a plausible answer. That is MEASURED, not feared:
// against a first draft of this file, seven of seven corrupted offsets resumed,
// one of them returning a state equal to the live boundary's with a committed
// effect silently dropped.
//
// So the extent is checked by CONTENT, and the two halves have two authors:
//
//   · `tag.coveredThrough` — the mark of the last record the prefix ACTUALLY
//     folded, copied off that record when the snapshot was minted.
//   · `tail.follows` — the mark of the record the LOG finds immediately before
//     the tail it hands back, read from its own bytes at resume time.
//
// Two sources, one fact. Hand the resume a corrupted offset and the log answers
// with a DIFFERENT record's mark, so the seam disagrees instead of folding.
//
// The bare offsets are still compared, and that check is not redundant: it is
// the one that catches a snapshot whose literal was misfiled against a tail
// somebody ELSE selected — the case where the two numbers genuinely do have two
// authors. It is a cheap second opinion, not the load-bearing one.
//
// WHAT THIS SEAM CANNOT SEE, said here rather than left for a reader to
// discover. The mark discriminates two offsets only when the two records
// DIFFER, and nothing in this reference guarantees that:
//
//   · two records with the same `now` AND the same rendered context are one
//     fact to this seam, so a drift between exactly those two offsets resumes.
//     Both halves earn their place against that — the Kotlin session has a
//     pair whose contexts render identically and are separated only by the
//     clock; freeze the clock and its mark separates 7 of 8. Measured, pinned
//     in both suites, and not closed.
//   · two DIFFERENT logs whose boundary records are byte-identical are
//     likewise indistinguishable.
//   · a tag forged CONSISTENTLY — offset and mark moved together — is a
//     forgery of the snapshot's own provenance that no tag field can catch.
//
// A deployment that needs more than this gives the log a per-record identity
// the reference does not mint; that is a store's job, and the store is
// product-owned (16.2).
//
// The tail stays an ARGUMENT rather than something `refoldFrom` slices out of a
// whole timeline, because 14.1's steel note says compacting below a snapshot
// trades away the ability to scrub or fork before that point: a resume that
// demanded the whole log could not run in the deployment that note exists for.
// A compacting store persists its boundary mark; the in-memory reader below
// computes it from the records it still holds.
//
// The snapshot stays a DERIVED CACHE: nothing here appends, and the timeline
// can always rebuild it. WHERE a snapshot is STORED, and how far below one a
// deployment may compact, remain product policy (16.2).

/** The committed identity of ONE step, copied verbatim off two fields the step
 *  already committed. Deliberately NOT a hash: a hash would need a canonical
 *  encoding (14.1) and would owe the Kotlin port a cross-language guarantee
 *  neither port is making. */
export interface RecordMark {
  readonly now: Timestamp;
  readonly digest: string;
  /** The step's committed results, verbatim. Review built a canonical session
   *  in which two adjacent records share (now, digest) — a coarse clock plus an
   *  unchanged rendered context — and a corrupted offset then resumed a wrong
   *  tail with every mark agreeing. The results list separates every record the
   *  reference commits. */
  readonly results: readonly ToolResultBase[];
}

/** Which reducer produced this prefix, how many committed steps it covers, and
 *  — the field that makes the offset checkable at all — WHICH record it stops
 *  at. 14.1 says "tag every snapshot with the reducer version and timeline
 *  offset it covers"; that is a floor on what a tag must carry, not a ceiling. */
export interface SnapshotTag {
  readonly reducerVersion: string;
  readonly offset: number;
  /** null exactly when the prefix is empty */
  readonly coveredThrough: RecordMark | null;
}

/** A snapshot IS a re-fold of a prefix — the state and the keyed effects that
 *  prefix produced — plus the tag saying which prefix, under which reducer. */
export interface Snapshot<S> extends Refolded<S> {
  readonly tag: SnapshotTag;
}

/** The LOG's half of the resume seam: some records, the offset the log says
 *  they begin at, and the mark of what it finds immediately before them. Built
 *  from the timeline, never from a snapshot — that is the whole point. */
export interface TimelineTail {
  readonly from: number;
  readonly records: readonly StepRecord[];
  /** null exactly when nothing precedes the tail the log served */
  readonly follows: RecordMark | null;
}

export interface ResumeOk<S> {
  readonly kind: "Resumed";
  readonly refolded: Refolded<S>;
}

export interface ResumeRefused {
  readonly kind: "Refused";
  readonly cause: string;
}

/** Total, like every other spine seam: a refusal is a value, not a throw. */
export type Resume<S> = ResumeOk<S> | ResumeRefused;

/** Memoize the fold of the first `at` committed steps. Both tag fields are
 *  derived from the prefix that was ACTUALLY folded, never from `at`, so a
 *  snapshot cannot be minted already lying about its own extent. */
export function snapshotAt<S>(
  initial: S,
  records: readonly StepRecord[],
  dispatchers: Dispatchers<S>,
  at: number,
  reducerVersion: string,
): Snapshot<S> {
  const prefix = records.slice(0, Math.max(at, 0));
  const last = prefix[prefix.length - 1];
  return {
    ...refold(initial, prefix, dispatchers),
    tag: {
      reducerVersion,
      offset: prefix.length,
      coveredThrough:
        last === undefined
          ? null
          : { now: last.now, digest: last.context.digest, results: last.results },
    },
  };
}

/** What the log hands back when asked for everything from `from` onward. An
 *  origin the log does not have — negative, or past the end — is served as
 *  NOTHING rather than clamped into a plausible slice: a tail that begins
 *  nowhere carries nothing, and says so in `follows`. */
export function timelineTail(records: readonly StepRecord[], from: number): TimelineTail {
  const within = from >= 0 && from <= records.length;
  const previous = within && from >= 1 ? records[from - 1] : undefined;
  return {
    from,
    records: within ? records.slice(from) : [],
    follows:
      previous === undefined
        ? null
        : { now: previous.now, digest: previous.context.digest, results: previous.results },
  };
}

/** Resume a re-fold from a snapshot instead of from genesis — and REFUSE rather
 *  than trust. Four questions, in order: is this the reducer you are folding
 *  with, does the log CONFIRM the record this prefix stops at, is the tail's
 *  declared origin a real position at all, and do the two extents agree
 *  numerically. Each is its own branch, so each has its own failing case and
 *  none can mask another. On acceptance the result is indistinguishable from
 *  `refold` over the whole timeline — same state, same keys, same timestamps. */
export function refoldFrom<S>(
  snapshot: Snapshot<S>,
  tail: TimelineTail,
  dispatchers: Dispatchers<S>,
  reducerVersion: string,
): Resume<S> {
  if (snapshot.tag.reducerVersion !== reducerVersion) {
    return {
      kind: "Refused",
      cause: `snapshot taken under reducer ${snapshot.tag.reducerVersion}, resumed under ${reducerVersion}`,
    };
  }
  if (!sameMark(snapshot.tag.coveredThrough, tail.follows)) {
    return {
      kind: "Refused",
      cause: `the log does not confirm the record this snapshot stops at (tag offset ${snapshot.tag.offset}, tail from ${tail.from})`,
    };
  }
  // A served tail follows nothing IF AND ONLY IF it begins at the origin. Both
  // out-of-range ends (negative AND past the last record) serve `follows: null`,
  // so a one-sided `from < 0` fence left the upper end agreeing vacuously with a
  // fresh snapshot's null mark — review resumed the INITIAL state as the whole
  // session that way, silently.
  if ((tail.follows === null) !== (tail.from === 0)) {
    return { kind: "Refused", cause: `the log does not serve a tail beginning at ${tail.from}` };
  }
  if (snapshot.tag.offset !== tail.from) {
    return {
      kind: "Refused",
      cause: `snapshot covers ${snapshot.tag.offset} committed steps; the tail declares it begins at ${tail.from}`,
    };
  }
  let state = snapshot.state;
  const effects: KeyedEffect<EffectBase>[] = [...snapshot.effects];
  // equal to `tag.offset` by the guard above; the log's own number is the one
  // these records actually sit at, so it is the one the keys are minted from.
  tail.records.forEach((record, index) => {
    const out = dispatchers.fold(state, record.results, record.now, record.sig);
    state = out.state;
    out.effects.forEach((effect, i) => effects.push(keyedEffect(tail.from + index, i, effect)));
  });
  return { kind: "Resumed", refolded: { state, effects } };
}

/** A missing mark on ONE side is a DISAGREEMENT, not a pass: "my prefix is
 *  empty" and "something precedes this tail" are contradictory claims.
 *
 *  The Kotlin port has no twin of this function and does not need one — its
 *  `RecordMark` is a `data class`, so `==` already means exactly this, nulls
 *  included. Same component, spelled per language (1.3). */
function sameMark(a: RecordMark | null, b: RecordMark | null): boolean {
  if (a === null || b === null) {
    return a === null && b === null;
  }
  // Results are committed transport data — plain, ordered, JSON-serializable —
  // and both sides of this comparison are minted from the same record shapes,
  // so a serialized compare is exact here. A hash would owe 14.1's canonical
  // encoding; this owes nothing beyond the log itself.
  return (
    a.now === b.now &&
    a.digest === b.digest &&
    JSON.stringify(a.results) === JSON.stringify(b.results)
  );
}
