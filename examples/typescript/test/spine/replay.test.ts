// ── G9 — a LIVE run against its REPLAY, not a fold against itself ──────────
//
// MEASURED against the shipped reference: seam 07 §D's own named violation (a
// tool reading a mutable global and performing a side effect) was injected, the
// world was mutated between runs, and `replayTest` PASSED — the tool's
// side-effect count never moved, because `foldAll` never invoked a tool. The
// old harness asserted f(x) == f(x), which seam 07 §C itself calls true by
// definition.
//
// What is asserted here is what a live boundary DID against what its committed
// bytes re-derive: state, and the FULL keyed effect sequence including every
// timestamp.

import { describe, expect, it } from "vitest";
import type { State } from "../../src/app/contract";
import { effectSink } from "../../src/app/wire";
import { escalation } from "../../src/blocks/escalation/register";
import { RecordingSink } from "../../src/spine/boundary/in-memory";
import type { StepRecord } from "../../src/spine/pure/step-record";
import type { Snapshot } from "../../src/spine/replay/replay";
import {
  collectPerform,
  refold,
  refoldFrom,
  snapshotAt,
  stateAtStep,
  timelineTail,
} from "../../src/spine/replay/replay";
import type { Harness } from "../harness";
import { AGENT_RUN, fakeWorld, harness, POLICY_TIER } from "../harness";
import { must } from "../support/must";

function driveFullSession(h: ReturnType<typeof harness>): void {
  const step = (by: "Agent" | "Human", ...actions: { tool: string; input: unknown }[]): void =>
    void h.app.boundary.onStepFinish({ by, staged: [], actions });

  step("Agent", { tool: "setPriority", input: { ticket: "4118", level: "High" } });
  step("Agent", { tool: "requestEscalation", input: { ticket: "4118" } });
  step("Agent", { tool: "confirmEscalation", input: { ticket: "4118" } }); // self → refused
  h.actAs("Agent", POLICY_TIER);
  step("Agent", { tool: "confirmEscalation", input: { ticket: "4118" } }); // other → granted
  step("Agent", { tool: "recordFinding", input: { text: "first" } });
  step("Agent", { tool: "requestSeal", input: {} });
  step("Human", { tool: "confirmSeal", input: {} });
}

describe("replay — a live run against its re-fold (G9)", () => {
  it("re-folds ONLY the committed bytes to the same state and the same effect sequence", () => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);

    const replayed = refold(h.app.initial, h.app.bus.records(), h.app.dispatchers);

    expect(replayed.state).toEqual(h.app.boundary.state);
    // the FULL sequence: keys AND every `at`
    expect(replayed.effects).toEqual(h.sink.performed);
    expect(replayed.effects.map((k) => k.effect.kind)).toEqual([
      "LogDecision",
      "Diag",
      "PageOncall",
      "DeliverArtifact",
    ]);
  });

  it("SCRUB: at k=3 the escalation is REQUESTED, refused once, and not yet granted", () => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);
    const records = h.app.bus.records();
    expect(records).toHaveLength(7);

    // k=3 is the one interior step that discriminates. The request went in at
    // step 2, the SELF-confirm at step 3 was refused at the gate, and the policy
    // tier that grants it acts at step 4 — so this is the moment the scrub story
    // is about: what the system believed BEFORE the grant, from the prefix alone.
    const scrubbed = stateAtStep(h.app.initial, records, h.app.dispatchers, 3);

    const status = must(escalation.statusOf(scrubbed.state.escalation, "4118"));
    expect(status.kind).toBe("Escalating");
    // and WHO asked is still outstanding — that is what the gate compares against
    expect(status.requestedBy).toBe(AGENT_RUN);
    // the refusal was logged as a Diag and nobody had been paged. The FULL effect
    // prefix, because a scrub that hid the effects would hide the page.
    expect(scrubbed.effects.map((keyed) => keyed.effect.kind)).toEqual(["LogDecision", "Diag"]);
    // The FULL keyed prefix — keys AND payloads — against what the LIVE sink
    // performed. Kind-names alone certified a prefix whose every effect KEY
    // was wrong (review built that mutant and both gates stayed green).
    expect(scrubbed.effects).toEqual(h.sink.performed.slice(0, 2));

    // the playhead dragged off the front end: CLAMPED, not thrown and not
    // wrapped. `slice(0, -1)` would silently drop the LAST record instead.
    const dragged = stateAtStep(h.app.initial, records, h.app.dispatchers, -1);
    expect(dragged.state).toEqual(h.app.initial);

    // and dragged to the RIGHT end, and past it. Positive named facts at the
    // upper boundary — the ticket reached Escalated, the page fired, the seal
    // was delivered — never `stateAtStep(n) === refold(all)`, which is true by
    // construction and proves nothing.
    const whole = stateAtStep(h.app.initial, records, h.app.dispatchers, records.length);
    expect(must(escalation.statusOf(whole.state.escalation, "4118")).kind).toBe("Escalated");
    expect(whole.effects.map((keyed) => keyed.effect.kind)).toEqual([
      "LogDecision",
      "Diag",
      "PageOncall",
      "DeliverArtifact",
    ]);
    const past = stateAtStep(h.app.initial, records, h.app.dispatchers, records.length + 5);
    expect(past.effects.map((keyed) => keyed.effect.kind)).toEqual([
      "LogDecision",
      "Diag",
      "PageOncall",
      "DeliverArtifact",
    ]);
  });

  it("REPLAY mode collects the descriptors and fires NOTHING", () => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);
    expect(h.world.pages).toEqual(["4118"]);
    expect(h.world.deliveries).toEqual([1]);

    const replayWorld = fakeWorld();
    const replaySink = new RecordingSink(effectSink(replayWorld.ports));
    collectPerform(h.app.initial, h.app.bus.records(), h.app.dispatchers, replaySink, "REPLAY");

    // descriptors collected …
    expect(replaySink.performed).toEqual(h.sink.performed);
    // … and NOTHING fired
    expect(replayWorld.world.pages).toEqual([]);
    expect(replayWorld.world.deliveries).toEqual([]);
    expect(replayWorld.world.logs).toEqual([]);
  });

  it("a live-source tool is caught by a CHECK, not by this harness — stated, not implied", () => {
    // Seam 07 §D claimed `replayTest` catches an impure tool. It cannot: replay
    // re-folds committed RESULTS and never invokes a tool body at all. What
    // catches a tool that reads a live source is gate check C3 (no clock, no
    // random, no id outside the boundary) and C8 (no await/fetch/node in a
    // block's pure files). See test/gate/gate.test.ts.
    expect(true).toBe(true);
  });
});

// ── 14.1 — a memoized fold prefix whose TAG refuses ───────────────────────
//
// 14.1's equation is `fold(snapshot@k, timeline[k..]) == fold(initialState,
// timeline)`, and asserting exactly that would be worth nothing: one pure
// function over one in-memory array, called twice, true by construction — the
// same f(x) == f(x) the header of this file exists to end. So the right-hand
// side of every acceptance assertion below is what the LIVE boundary and the
// LIVE sink actually produced, never a second re-fold.
//
// The REFUSAL cases mutate ONLY the tag — state and memoized effects stay byte
// identical to the honest snapshot — which is what makes them tag tests rather
// than corruption tests. And they resume at the tag's OWN offset, because that
// is the only resume site a STORED snapshot permits: nothing else in the system
// knows which prefix a snapshot covers. A guard that only refuses when the
// caller volunteers an independent number is a guard that never fires in
// production.
describe("snapshot — a memoized fold prefix, tagged and refusable (14.1)", () => {
  // STRICTLY INTERIOR, and a literal rather than something derived from
  // `records.length`. At 0 the resume degenerates into the full re-fold already
  // asserted above; at 7 the tail is empty and the snapshot IS the answer.
  // Either one passes without the seam having done anything.
  const K = 3;
  const VERSION = "fold-v1";

  const driven = (): Harness => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);
    return h;
  };

  /** THE resume site — the tail is requested AT THE TAG'S OWN OFFSET, because a
   *  reader holding a stored snapshot has no other source for it. */
  const resumeAt = (h: Harness, s: Snapshot<State>) =>
    refoldFrom(
      s,
      timelineTail(h.app.bus.records(), s.tag.offset),
      h.app.dispatchers,
      h.app.reducerVersion,
    );

  it("a snapshot-seeded resume equals what the LIVE boundary and LIVE sink produced", () => {
    const h = driven();
    const records = h.app.bus.records();
    expect(records.length).toBe(7);
    expect(h.app.reducerVersion).toBe(VERSION);

    const snap = snapshotAt(h.app.initial, records, h.app.dispatchers, K, h.app.reducerVersion);
    expect(snap.tag.reducerVersion).toBe(VERSION);
    expect(snap.tag.offset).toBe(K);
    // the tag names the record it stops at, read off the prefix it folded
    expect(snap.tag.coveredThrough).toEqual({
      now: must(records[K - 1]).now,
      digest: must(records[K - 1]).context.digest,
      results: must(records[K - 1]).results,
    });

    // INTERIOR, proven at BOTH ends rather than asserted in a comment: the
    // prefix folded something (k > 0, or this is the whole-timeline re-fold
    // already covered) and the tail still has something left (k < n, or the
    // snapshot IS the answer and the seam did nothing).
    expect(snap.tag.offset).toBeGreaterThan(0);
    expect(snap.tag.offset).toBeLessThan(records.length);
    // …and the memo is genuinely not the answer yet.
    expect(snap.state).not.toEqual(h.app.boundary.state);
    expect(snap.effects.length).toBeLessThan(h.sink.performed.length);

    const resumed = resumeAt(h, snap);
    expect(resumed.kind).toBe("Resumed");
    const refolded = must(resumed.kind === "Resumed" ? resumed.refolded : null);

    // the LIVE anchors, not a second call to `refold`
    expect(refolded.state).toEqual(h.app.boundary.state);
    // the FULL sequence: keys AND every `at`, the prefix's effects included
    expect(refolded.effects).toEqual(h.sink.performed);
  });

  it("the record mark DISCRIMINATES every committed step — the seam's precondition", () => {
    // If two records ever shared a mark, the extent guard below would silently
    // stop distinguishing their offsets and every refusal case would go vacuous
    // while staying green. So the precondition is pinned, not assumed.
    const records = driven().app.bus.records();
    const marks = records.map((r) => `${r.now} ${r.context.digest}`);
    expect(new Set(marks).size).toBe(records.length);
  });

  it("BOTH halves of the mark carry weight, and the precondition has a MEASURED edge", () => {
    // A two-component mark invites a component nobody checks. Measured on a
    // draft of this file: a `sameMark` that compared only `now` left the whole
    // suite green, because against a MOVING clock the timestamps alone separate
    // every record. So each half is put in a configuration where it is the only
    // thing doing the work, and the numbers are pinned.
    const census = (step: number) => {
      const h = harness({ start: 1000, step });
      driveFullSession(h);
      const r = h.app.bus.records();
      return {
        n: r.length,
        byNow: new Set(r.map((x) => x.now)).size,
        byDigest: new Set(r.map((x) => x.context.digest)).size,
        byMark: new Set(r.map((x) => `${x.now}|${x.context.digest}|${JSON.stringify(x.results)}`))
          .size,
      };
    };

    // THE DEFAULT RIG: the clock moves and the mark separates every step. This
    // is the precondition the drift loops below actually rely on.
    expect(census(7)).toEqual({ n: 7, byNow: 7, byDigest: 7, byMark: 7 });

    // FREEZE THE CLOCK. `now` is a value the boundary READS (G9) — not a
    // counter, and nothing promises it moves; a coarse clock stamps several
    // steps inside one tick. The timestamp half collapses to a single value and
    // the committed context digest (G15) alone still separates all seven. That
    // is what makes `digest` load-bearing rather than decoration.
    expect(census(0)).toEqual({ n: 7, byNow: 1, byDigest: 7, byMark: 7 });

    // …and the refusals must still ALL hold under that frozen clock, which is
    // what turns the census above from a description into a guard: a mark
    // comparison that read only `now` would find every record identical here
    // and wave every drift through.
    const h = harness({ start: 1000, step: 0 });
    driveFullSession(h);
    const frozen = h.app.bus.records();
    const honest = snapshotAt(h.app.initial, frozen, h.app.dispatchers, K, h.app.reducerVersion);
    expect(resumeAt(h, honest).kind).toBe("Resumed");
    for (const drift of [0, 1, 2, 4, 5, 6, 7, 8, 12, 99]) {
      const corrupt = { ...honest, tag: { ...honest.tag, offset: drift } };
      expect(resumeAt(h, corrupt).kind, `frozen clock, offset ${drift}`).toBe("Refused");
    }

    // THE FORMER EDGE, now closed: the Kotlin canonical session commits a pair
    // sharing timestamp AND rendered context, and a drift across exactly that
    // pair once resumed with every mark agreeing. The mark's third half — the
    // step's committed results — separates every record either reference
    // commits. The honest residual: two records identical in now, digest AND
    // results are indistinguishable here, and a fold of two byte-identical
    // steps from either offset is the same fold — stated, not papered over.
  });

  it("a drift between two same-digest records is REFUSED by the `now` half alone", () => {
    // The configuration where `now` is the ONLY thing working: two records
    // sharing one rendered context (identical digest) that differ only in
    // timestamp. Without `a.now === b.now` in sameMark this resumes — review
    // proved the whole gate green under exactly that mutation.
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);
    const live = h.app.bus.records();
    const a = must(live[0]);
    const b = must(live[1]);
    const bPrime: StepRecord = { ...b, context: a.context };
    const log: readonly StepRecord[] = [a, bPrime, ...live.slice(2)];
    expect(must(log[0]).context.digest).toBe(must(log[1]).context.digest);
    expect(must(log[0]).now).not.toBe(must(log[1]).now);

    const snap = snapshotAt(h.app.initial, log, h.app.dispatchers, 1, h.app.reducerVersion);
    const corrupt = { ...snap, tag: { ...snap.tag, offset: 2 } };
    const verdict = refoldFrom(
      corrupt,
      timelineTail(log, 2),
      h.app.dispatchers,
      h.app.reducerVersion,
    );
    expect(verdict.kind).toBe("Refused");
  });

  it("REFUSES every corrupted offset AT THE ONLY RESUME SITE a stored snapshot permits", () => {
    const h = driven();
    const records = h.app.bus.records();
    const honest = snapshotAt(h.app.initial, records, h.app.dispatchers, K, h.app.reducerVersion);

    // the control: the honest snapshot resumes, and to the LIVE answer
    const ok = resumeAt(h, honest);
    expect(ok.kind).toBe("Resumed");
    const refolded = must(ok.kind === "Resumed" ? ok.refolded : null);
    expect(refolded.state).toEqual(h.app.boundary.state);
    expect(refolded.effects).toEqual(h.sink.performed);

    // Every other offset the tag could carry — 0 and n included, which are the
    // two degenerate ends. State and effects are byte-identical to `honest`;
    // ONLY the number moved. Each must REFUSE, never fold a wrong tail into a
    // plausible answer: at drift 4 the resulting state is EQUAL to the live
    // boundary's with one committed effect dropped, so what is asserted here is
    // the VERDICT, never the outcome.
    // 8, 12 and 99 are PAST the end: the log serves an empty tail whose
    // `follows` is null there, exactly as it does at the origin, and review
    // resumed the INITIAL state as the whole session through that agreement.
    // The origin biconditional (follows === null ⟺ from === 0) is what
    // refuses them now.
    for (const drift of [0, 1, 2, 4, 5, 6, 7, 8, 12, 99]) {
      const corrupt = { ...honest, tag: { ...honest.tag, offset: drift } };
      expect(resumeAt(h, corrupt).kind, `offset ${drift}`).toBe("Refused");
    }
  });

  it("REFUSES a snapshot whose reducer version is not the one being folded with", () => {
    const h = driven();
    const records = h.app.bus.records();
    const snap = snapshotAt(h.app.initial, records, h.app.dispatchers, K, h.app.reducerVersion);
    const tail = timelineTail(records, K);

    // SAME state, SAME effects, SAME extent — only the version differs, which
    // is exactly the mutation 14.1 says makes a snapshot untrustworthy (14.7).
    const stale = { ...snap, tag: { ...snap.tag, reducerVersion: "fold-v2" } };
    const out = refoldFrom(stale, tail, h.app.dispatchers, h.app.reducerVersion);
    expect(out.kind).toBe("Refused");
    expect(must(out.kind === "Refused" ? out.cause : null)).toContain("fold-v2");

    // …and the unmutated snapshot still resumes, so the refusal is about the
    // TAG and not about the seam being broken for everything.
    expect(refoldFrom(snap, tail, h.app.dispatchers, h.app.reducerVersion).kind).toBe("Resumed");
  });

  it("REFUSES a misfiled offset against a tail somebody ELSE selected", () => {
    const h = driven();
    const records = h.app.bus.records();
    const snap = snapshotAt(h.app.initial, records, h.app.dispatchers, K, h.app.reducerVersion);
    const tail = timelineTail(records, K);

    // The case the NUMERIC half owns and the content mark cannot see: the tail
    // is the honest one, so `follows` still agrees; only the literal moved.
    for (const drift of [K - 1, K + 1]) {
      const misfiled = { ...snap, tag: { ...snap.tag, offset: drift } };
      expect(misfiled.tag.coveredThrough).toEqual(snap.tag.coveredThrough);
      const out = refoldFrom(misfiled, tail, h.app.dispatchers, h.app.reducerVersion);
      expect(out.kind, `offset ${drift}`).toBe("Refused");
    }

    // The log is the other party: ask it for a tail at a different offset and
    // the honest snapshot refuses that too.
    expect(
      refoldFrom(snap, timelineTail(records, K + 1), h.app.dispatchers, h.app.reducerVersion).kind,
    ).toBe("Refused");
    expect(refoldFrom(snap, tail, h.app.dispatchers, h.app.reducerVersion).kind).toBe("Resumed");
  });

  it("the tag records what was FOLDED, never what was asked for", () => {
    const h = driven();
    const records = h.app.bus.records();

    const over = snapshotAt(
      h.app.initial,
      records,
      h.app.dispatchers,
      records.length + 2,
      h.app.reducerVersion,
    );
    expect(over.tag.offset).toBe(records.length);
    expect(over.tag.coveredThrough).toEqual({
      now: must(records.at(-1)).now,
      digest: must(records.at(-1)).context.digest,
      results: must(records.at(-1)).results,
    });

    // …and it stays honest downstream against a log that later grows past it:
    // a tag that had recorded `at` would now point into records it never folded.
    const grown = [...records, ...records.slice(0, 2)];
    expect(
      refoldFrom(
        over,
        timelineTail(grown, records.length + 2),
        h.app.dispatchers,
        h.app.reducerVersion,
      ).kind,
    ).toBe("Refused");
    // the honest extent over the SAME grown log still resumes
    expect(
      refoldFrom(over, timelineTail(grown, records.length), h.app.dispatchers, h.app.reducerVersion)
        .kind,
    ).toBe("Resumed");
  });

  it("a negative extent folds nothing, and a tail that begins nowhere carries nothing", () => {
    const h = driven();
    const records = h.app.bus.records();

    const under = snapshotAt(h.app.initial, records, h.app.dispatchers, -1, h.app.reducerVersion);
    expect(under.tag.offset).toBe(0);
    expect(under.tag.coveredThrough).toBe(null);
    expect(under.effects).toEqual([]);

    // A tail asked for at an origin the log does not have is served as NOTHING
    // rather than clamped into a plausible slice — the whole log came back here
    // before this landing, under a `from` of -1.
    const back = timelineTail(records, -1);
    expect(back.records.length).toBe(0);
    expect(back.follows).toBe(null);
    expect(timelineTail(records, records.length + 1).records.length).toBe(0);

    const honest = snapshotAt(h.app.initial, records, h.app.dispatchers, K, h.app.reducerVersion);
    expect(refoldFrom(honest, back, h.app.dispatchers, h.app.reducerVersion).kind).toBe("Refused");

    // THE DEGENERATE PAIR the content mark alone cannot separate: an empty
    // prefix has no mark, and neither does a tail beginning nowhere, so both
    // marks are null and AGREE. Only refusing a negative origin outright keeps
    // this from resuming to the initial state and calling it the whole session.
    const corrupt = { ...under, tag: { ...under.tag, offset: -1 } };
    expect(resumeAt(h, corrupt).kind).toBe("Refused");
    // …while the same snapshot, uncorrupted, resumes to the LIVE answer.
    const ok = resumeAt(h, under);
    expect(ok.kind).toBe("Resumed");
    expect(must(ok.kind === "Resumed" ? ok.refolded : null).effects).toEqual(h.sink.performed);
  });
});
