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
import { effectSink } from "../../src/app/wire";
import type { SetPriorityResult, SetPriorityResultV1 } from "../../src/blocks/triage/contract";
import { PRE_V2_REASON, upcastSetPriority } from "../../src/blocks/triage/tools";
import type { StepChannel } from "../../src/spine/boundary/action";
import { RecordingSink } from "../../src/spine/boundary/in-memory";
import { authority, Signature } from "../../src/spine/pure/actor";
import type { StepRecord, StepRecordV1 } from "../../src/spine/pure/step-record";
import { GENESIS_SCHEMA_VERSION, SCHEMA_VERSION, upcastV1 } from "../../src/spine/pure/step-record";
import { collectPerform, refold, stateAtStep } from "../../src/spine/replay/replay";
import { fakeWorld, harness, POLICY_TIER } from "../harness";
import { must } from "../support/must";

function driveFullSession(h: ReturnType<typeof harness>): void {
  const step = (channel: StepChannel, ...actions: { tool: string; input: unknown }[]): void =>
    void channel.submit({ staged: [], actions });
  const agent = h.app.boundary.agent;
  const human = h.app.boundary.human;

  step(agent, { tool: "setPriority", input: { ticket: "4118", level: "High" } });
  step(agent, { tool: "requestEscalation", input: { ticket: "4118" } });
  step(agent, { tool: "confirmEscalation", input: { ticket: "4118" } }); // self → refused
  h.actAs("Agent", POLICY_TIER);
  step(agent, { tool: "confirmEscalation", input: { ticket: "4118" } }); // other → granted
  step(agent, { tool: "recordFinding", input: { text: "first" } });
  step(agent, { tool: "requestSeal", input: {} });
  step(human, { tool: "confirmSeal", input: {} });
}

// ── THE SCRUB CURSOR, PROVEN BY EXERCISE ─────────────────────────────────
// docs/DECISIONS.md:117-118 ratifies the cursor "proving the scrub story BY
// EXERCISE", and the doc comment over `stateAtStep` promises exactly what is
// below — "BOTH ends are asserted, at an interior k and at the right edge, in
// test/spine/replay.test.ts". A review found the promise false in both ports
// and the tool called by nothing at all: a mutation making it ignore `k` and
// fold the WHOLE timeline left the full gate green, 434/434. A scrub bar wired
// to that would show the end state at every position on the drag.
describe("stateAtStep — the scrub prefix, at both ends and in between", () => {
  it("re-folds ONLY the prefix: an INTERIOR k stops where the cursor is", () => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);
    const records = h.app.bus.records();
    const at = (k: number) =>
      stateAtStep(h.app.initial, records, h.app.dispatchers, h.app.licences, k);

    // THE MUTATION THAT SURVIVED: `k` ignored, whole timeline folded. Every
    // interior position must differ from the end state, or the cursor is a
    // no-op wearing a parameter.
    const whole = at(records.length);
    for (let k = 1; k < records.length; k += 1) {
      expect(at(k).state, `k=${k} must not already be the end state`).not.toEqual(whole.state);
      // and it must equal the re-fold of exactly that many records — the
      // independent derivation, not this function talking to itself.
      expect(at(k).state).toEqual(
        refold(h.app.initial, records.slice(0, k), h.app.dispatchers, h.app.licences).state,
      );
    }
  });

  it("CLAMPS BY SLICING, never by throwing — below zero and past the end", () => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);
    const records = h.app.bus.records();
    const at = (k: number) =>
      stateAtStep(h.app.initial, records, h.app.dispatchers, h.app.licences, k);

    // LEFT EDGE: the initial state, and no effect re-derived.
    expect(at(0).state).toEqual(h.app.initial);
    expect(at(-5).state).toEqual(h.app.initial);
    expect(at(0).effects).toEqual([]);
    // RIGHT EDGE: the whole timeline, and past it is still the whole timeline.
    const whole = refold(h.app.initial, records, h.app.dispatchers, h.app.licences);
    expect(at(records.length).state).toEqual(whole.state);
    expect(at(records.length + 99).state).toEqual(whole.state);
    expect(at(records.length).effects).toEqual(whole.effects);
  });
});

describe("replay — a live run against its re-fold (G9)", () => {
  it("re-folds ONLY the committed bytes to the same state and the same effect sequence", () => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);

    const replayed = refold(h.app.initial, h.app.bus.records(), h.app.dispatchers, h.app.licences);

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

  it("REPLAY mode collects the descriptors and fires NOTHING", () => {
    const h = harness({ start: 1000, step: 7 });
    driveFullSession(h);
    expect(h.world.pages).toEqual(["4118"]);
    expect(h.world.deliveries).toEqual([1]);

    const replayWorld = fakeWorld();
    const replaySink = new RecordingSink(effectSink(replayWorld.ports));
    collectPerform(
      h.app.initial,
      h.app.bus.records(),
      h.app.dispatchers,
      h.app.licences,
      replaySink,
      "REPLAY",
    );

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

// ── 14.7 — SCHEMA EVOLUTION, over a log written before the field existed ────
//
// Two things are being proven, and only the pair is worth anything:
//
//   1. THE OLD LOG CANNOT REPLAY AT ALL — in BOTH halves, envelope and payload,
//      each isolated by its own inverting assertion below.
//   2. THE UPCAST IS OBSERVABLE. Re-folding the LIFTED log produces a different
//      effect sequence from re-folding a native v2 one, in a field the fold
//      actually consumes. An upcaster whose output nothing reads is a function
//      that can be deleted with every test still green.
//
// The v1 log is an in-code typed fixture rather than a file on disk, because
// this reference persists nothing: the bus is an array of typed records and
// 14.1's canonical encoding is deliberately product-owned. So the "old shape"
// is a TYPE the compiler refuses, which is a stronger fixture than bytes a
// hand-written parser would have to agree with.
const V1_SIG = new Signature("Agent", authority("agent-run-7f"));

const v1Result: SetPriorityResultV1 = {
  outcome: "ok-v1",
  tool: "setPriority",
  ticket: "4118",
  level: "High",
};

const v1Log = (): readonly StepRecordV1<SetPriorityResultV1>[] => [
  {
    schemaVersion: GENESIS_SCHEMA_VERSION,
    now: 1000,
    sig: V1_SIG,
    staged: [],
    actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    results: [v1Result],
    commands: [],
    context: { promptVersion: "triage-prompt@1", digest: "" },
  },
];

describe("schema evolution — an old-shape log replays only through its upcaster (14.7)", () => {
  // ── THE THREE ISOLATING REFUSALS ────────────────────────────────────────
  // Each `@ts-expect-error` below IS the assertion: it fails the build the
  // moment the error it names stops happening. They are deliberately THREE and
  // not one, because a single directive that can be satisfied by any of three
  // defects passes for the wrong reason as soon as two of them are weakened.
  // Proven independent: making the envelope optional inverts only the first;
  // widening the envelope off the literal inverts only the second; reverting the
  // v1 payload's discriminant inverts only the third.

  it("REFUSES an unstamped record: the envelope is REQUIRED, not defaulted", () => {
    const seven = {
      now: 1000,
      sig: V1_SIG,
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
      results: [],
      commands: [],
      context: { promptVersion: "triage-prompt@1", digest: "" },
    };
    // @ts-expect-error — `schemaVersion` is missing. The ONLY defect in this
    // value is the absent envelope; every other field is current-shape.
    const unstamped: StepRecord = seven;
    expect(unstamped.now).toBe(1000);
  });

  it("REFUSES a STALE version: a current-shape record still stamped genesis is not current", () => {
    // Payloads already lifted, so the only defect left is the number itself.
    // This is what makes the version type-level LOAD-BEARING rather than a
    // write-only decoration: widen `schemaVersion` off the literal and this
    // directive goes unused.
    const lifted = upcastV1(must(v1Log()[0]), upcastSetPriority);
    // @ts-expect-error — GENESIS is not the current version.
    const stale: StepRecord = { ...lifted, schemaVersion: GENESIS_SCHEMA_VERSION };
    expect(stale.results).toHaveLength(1);
  });

  it("REFUSES a v1 PAYLOAD under a v2 envelope — the structural half", () => {
    // The hole a structural language leaves open, closed. Re-stamping the
    // envelope by hand is trivial; what must not typecheck is the RESULT of
    // doing so, because that record folds and yields a `reason` of `undefined`
    // — a value neither `SetPriorityResult` nor `LogDecision` admits.
    // `SetPriorityResultV1.outcome` is `"ok-v1"`, which `ResultOutcome` does
    // not have, so the array is not a `readonly ToolResultBase[]`.
    const v1 = must(v1Log()[0]);
    // @ts-expect-error — v1 payloads are not ToolResults, whatever the envelope says.
    const forged: StepRecord = { ...v1, schemaVersion: SCHEMA_VERSION };
    expect(forged.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("this port writes v2, and genesis was 1 — the numbers, not just the constants", () => {
    // CX-1: without this, every other assertion compares the committed value
    // against the constant that produced it, and both sides move together under
    // a mutation. These are the only two hard values in the envelope story.
    expect(SCHEMA_VERSION).toBe(2);
    expect(GENESIS_SCHEMA_VERSION).toBe(1);
    expect(SCHEMA_VERSION).not.toBe(GENESIS_SCHEMA_VERSION);
  });

  // ── THE UPCAST, AND ITS CONTROL ─────────────────────────────────────────

  it("LIFTS it: the upcast log re-folds, and the upcaster's decision is in the effect", () => {
    const h = harness({ start: 1000, step: 7 });
    const lifted = v1Log().map((record) => upcastV1(record, upcastSetPriority));

    expect(lifted[0]?.schemaVersion).toBe(SCHEMA_VERSION);

    const replayed = refold(h.app.initial, lifted, h.app.dispatchers, h.app.licences);
    expect(replayed.effects.map((keyed) => keyed.effect)).toEqual([
      {
        kind: "LogDecision",
        at: 1000,
        effectClass: "Routine",
        ticket: "4118",
        level: "High",
        supersedes: "Normal",
        reason: PRE_V2_REASON,
      },
    ]);
    expect(h.app.boundary.state.triage.priority.get("4118")).toBe("Normal");
    expect(replayed.state.triage.priority.get("4118")).toBe("High");
  });

  it("the field is OBSERVABLE: a NATIVE v2 record re-folds to a different effect", () => {
    // The control, and it is built from a real v2 literal rather than by
    // spreading the v1 payload: a "native" record assembled out of history is
    // not a control at all, and under the payload refusal above it does not
    // even compile.
    const h = harness({ start: 1000, step: 7 });
    const nativeResult: SetPriorityResult = {
      outcome: "ok",
      tool: "setPriority",
      ticket: "4118",
      level: "High",
      reason: "customer escalated",
    };
    const native: readonly StepRecord[] = [
      {
        schemaVersion: SCHEMA_VERSION,
        now: 1000,
        sig: V1_SIG,
        staged: [],
        actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
        results: [nativeResult],
        commands: [],
        context: { promptVersion: "triage-prompt@1", digest: "" },
      },
    ];

    const replayed = refold(h.app.initial, native, h.app.dispatchers, h.app.licences);
    expect(replayed.effects.map((keyed) => keyed.effect)).toEqual([
      {
        kind: "LogDecision",
        at: 1000,
        effectClass: "Routine",
        ticket: "4118",
        level: "High",
        supersedes: "Normal",
        reason: "customer escalated",
      },
    ]);
  });

  it("a LIVE step commits the envelope, at the one site that mints a record", () => {
    const h = harness({ start: 1000, step: 7 });
    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });
    expect(h.app.bus.records().map((r) => r.schemaVersion)).toEqual([2]);
  });
});
