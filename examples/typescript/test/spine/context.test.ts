// ── G15 — the reasoner's input is a named, typed, BOUNDED projection ───────
// The shipped reference had one sentence for this seam: no type, no projection,
// no bound, no capture rule, no invariant, no test layer. Below is the test
// layer.

import { describe, expect, it } from "vitest";
import { projectContext } from "../../src/app/assemble";
import type { State } from "../../src/app/contract";
import { initialState } from "../../src/app/contract";
import { effectSink, wireApp } from "../../src/app/wire";
import { analysisContextLines } from "../../src/blocks/analysis/project";
import { withNote } from "../../src/blocks/analysis/slice";
import { artifactContextLines } from "../../src/blocks/artifact/project";
import { consoleContextLines } from "../../src/blocks/console/project";
import { withFocus } from "../../src/blocks/console/slice";
import { escalationContextLines } from "../../src/blocks/escalation/project";
import { inboxContextLines } from "../../src/blocks/inbox/project";
import { withConflated, withDuplicate, withFault } from "../../src/blocks/inbox/slice";
import { triageContextLines } from "../../src/blocks/triage/project";
import { buildTools } from "../../src/spine/agent/loop";
import { movingClock, RecordingSink } from "../../src/spine/boundary/in-memory";
import type { ContextBounds } from "../../src/spine/pure/context";
import {
  DEFAULT_CONTEXT_BOUNDS,
  MAX_CONTEXT_LINES_PER_BLOCK,
  MAX_CONTEXT_NOTICES,
  render,
} from "../../src/spine/pure/context";
import { rejected } from "../../src/spine/pure/notice";
import type { StagedInput } from "../../src/spine/pure/staged";
import { fresh, lastKnown, perceived } from "../../src/spine/pure/staged";
import { contextDivergence } from "../../src/spine/replay/replay";
import { fakeWorld, harness } from "../harness";
import { must } from "../support/must";

describe("projectContext — the THIRD pure projection (G15)", () => {
  it("is a projection of committed State plus the ONE staged input", () => {
    const state = initialState({ tickets: [{ id: "4118", body: "refund not received" }] });
    const staged = [perceived("inbox", "customer wrote in", "inbox-1")];
    const context = projectContext(state, staged);

    expect(context.staged).toEqual(staged);
    expect(context.artifactLineCount).toBe(0);
    expect(context.lines).toContain("ticket 4118 [Normal]: refund not received");
    expect(context.lines).toContain("ticket 4118: open, may be escalated");
    // calling it twice on the same input is the same value — it accumulates nothing
    expect(projectContext(state, staged)).toEqual(context);
  });

  it("is O(1) in timeline length: 500 tickets and 200 notices stay within the caps", () => {
    const tickets = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, body: `body ${i}` }));
    const base = initialState({ tickets });
    const state = {
      ...base,
      spine: {
        ...base.spine,
        notices: Array.from({ length: 200 }, (_, i) => rejected(i, "setPriority", `reason ${i}`)),
      },
    };

    const context = projectContext(state, []);
    // four blocks, each capped
    expect(context.lines.length).toBeLessThanOrEqual(4 * MAX_CONTEXT_LINES_PER_BLOCK);
    expect(context.notices.length).toBe(MAX_CONTEXT_NOTICES);
    // the artifact enters by COUNT, never by content
    expect(context.artifactLineCount).toBe(0);
    expect(render(context).length).toBeLessThan(4000);
  });

  it("the committed digest is re-derivable from committed State — the fixture IS a check", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [perceived("inbox", "urgent", "inbox-2")],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "recordFinding", input: { text: "noted" } }],
    });

    expect(
      contextDivergence(
        h.app.initial,
        h.app.bus.records(),
        h.app.dispatchers,
        h.app.boundary.contextBounds,
      ),
    ).toEqual([]);
  });

  it("a change to what the model saw fails the golden trace without re-running the model", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });

    const tampered = h.app.bus.records().map((r) => ({
      ...r,
      context: { ...r.context, digest: `${r.context.digest} (and one more thing)` },
    }));
    expect(
      contextDivergence(h.app.initial, tampered, h.app.dispatchers, h.app.boundary.contextBounds),
    ).toEqual(["step 0: context digest diverged"]);
  });
});

// ── The bound is ROOT-CONFIGURABLE, and moving it is caught ────────────────
// docs/DECISIONS.md:174. Four halves, and each one exists because the previous
// one is not enough on its own.
//
// Before this suite the tree could not tell a bound change from no change at
// all: `MAX_CONTEXT_LINES_PER_BLOCK` 8 -> 4 and `MAX_CONTEXT_NOTICES` 8 -> 3
// left BOTH gates green, because every assertion about the bound was written in
// terms of the constant it was asserting, and the digest walk re-derived with
// the same constant it had committed under. Measured, both directions: green at
// 4, green at 40.
//
// WHY PER SITE AND NOT ONE LINE COUNT. An aggregate cannot say WHICH read
// honoured the window. Measured on the first cut of this file, three of the six
// injected block reads could be replaced by the shipped constant with the whole
// suite still green, because those three blocks contributed 0 or 1 lines to the
// fixture and so could not clamp. The fixture below is built until every site
// overflows a window of 2, and each site is asserted on its own.
describe("the growth bound is wired, not welded (G15)", () => {
  const NARROW: ContextBounds = { linesPerBlock: 2, notices: 2 };

  /** Six tickets, so a window of 2 and the shipped window of 8 cannot render
   *  the same digest. With one ticket every bound above 1 agrees, and the
   *  cross-bound walk below would pass vacuously. */
  const SIX = Array.from({ length: 6 }, (_, i) => ({ id: `T${i}`, body: `body ${i}` }));
  const PANELS = ["p0", "p1", "p2", "p3", "p4", "p5"];

  /** A state in which EVERY block that contributes context lines contributes
   *  MORE than `NARROW.linesPerBlock`, and the spine holds more notices than
   *  `NARROW.notices`. Built through each block's own slice constructors — the
   *  cheapest way to make a site observable is to give it something to clamp. */
  function crowded(): State {
    const base = initialState({ tickets: SIX, panels: PANELS });
    let analysis = base.analysis;
    for (const i of [0, 1, 2]) {
      analysis = withNote(analysis, {
        at: 1000 + i,
        recall:
          i === 1
            ? lastKnown({ publishedAt: 900, text: `conclusion ${i}` })
            : fresh({ publishedAt: 900, text: `conclusion ${i}` }),
      });
    }
    let inbox = base.inbox;
    inbox = withConflated(inbox, "s0", 2);
    inbox = withConflated(inbox, "s1", 3);
    inbox = withDuplicate(inbox, "s2");
    inbox = withFault(inbox, { at: 1000, source: "s3", fault: "backend timeout" });
    return {
      ...base,
      console: withFocus(base.console, "T0"),
      analysis,
      inbox,
      spine: {
        ...base.spine,
        notices: Array.from({ length: 10 }, (_, i) => rejected(i, "setPriority", `reason ${i}`)),
      },
    };
  }

  it("PINS the shipped defaults: the window every app inherits is 8 and 8", () => {
    // The literals, not the constants: an assertion written as
    // `toBe(MAX_CONTEXT_LINES_PER_BLOCK)` witnesses itself and moves with the
    // edit it exists to catch.
    expect(DEFAULT_CONTEXT_BOUNDS).toEqual({ linesPerBlock: 8, notices: 8 });
    expect(MAX_CONTEXT_LINES_PER_BLOCK).toBe(8);
    expect(MAX_CONTEXT_NOTICES).toBe(8);
  });

  it("EVERY block's window is observable ON ITS OWN, not through one total", () => {
    const s = crowded();
    // The default counts are MEASURED against this fixture, not guessed; each is
    // above NARROW.linesPerBlock, which is the whole reason the fixture is built
    // this way rather than taken from `initialState` alone.
    expect(triageContextLines(s.triage).length).toBe(6);
    expect(triageContextLines(s.triage, 2).length).toBe(2);

    expect(escalationContextLines(s.escalation).length).toBe(6);
    expect(escalationContextLines(s.escalation, 2).length).toBe(2);

    expect(consoleContextLines(s.console).length).toBe(7);
    expect(consoleContextLines(s.console, 2).length).toBe(2);

    expect(analysisContextLines(s.analysis).length).toBe(3);
    expect(analysisContextLines(s.analysis, 2).length).toBe(2);

    expect(inboxContextLines(s.inbox).length).toBe(4);
    expect(inboxContextLines(s.inbox, 2).length).toBe(2);

    // THE ARTIFACT IS THE SITE AN AGGREGATE CANNOT REACH. It emits exactly one
    // count line, so no window of 1 or more can clamp it and no total moves when
    // it stops honouring the argument. Proved BELOW its natural size instead.
    expect(artifactContextLines(s.artifact).length).toBe(1);
    expect(artifactContextLines(s.artifact, 0)).toEqual([]);
  });

  it("the ROOT's window reaches every line site, including the one that cannot clamp", () => {
    // A window of ZERO empties the projection. This is the only assertion that
    // reaches the artifact's line site THROUGH `projectContext`: at any window a
    // block can survive, the artifact's single line is unobservable in a total.
    expect(projectContext(crowded(), [], { linesPerBlock: 0, notices: 8 }).lines).toEqual([]);
  });

  it("the notices field is its OWN window, isolated from linesPerBlock", () => {
    const s = crowded();
    expect(projectContext(s, []).notices.length).toBe(8);
    // linesPerBlock held EQUAL to the committed value, so only the notices field
    // varies and the assertion cannot be satisfied by the lines moving instead.
    expect(projectContext(s, [], { linesPerBlock: 8, notices: 2 }).notices.length).toBe(2);
    // and the converse: moving linesPerBlock alone leaves the notices at 8.
    expect(projectContext(s, [], { linesPerBlock: 2, notices: 8 }).notices.length).toBe(8);
  });

  it("the aggregate is the SUM of the sites, and the root moves all of them", () => {
    const s = crowded();
    // 27 = triage 6 + escalation 6 + console 7 + artifact 1 + analysis 3 + inbox 4
    expect(projectContext(s, []).lines.length).toBe(27);
    // 11 = 2 + 2 + 2 + 1 + 2 + 2 — the artifact's one line cannot clamp at 2,
    // which is exactly why the per-site case above proves it at 0 instead.
    expect(projectContext(s, [], NARROW).lines.length).toBe(11);
  });

  it("a root that says NOTHING inherits the shipped window, explicitly", () => {
    expect(harness().app.boundary.contextBounds).toEqual(DEFAULT_CONTEXT_BOUNDS);
  });

  it("the boundary commits under the window it was WIRED with, not the default", () => {
    // WIRED NARROW, deliberately: a boundary that reached for the default
    // instead of the value it was handed would still pass a test wired to the
    // default, which is the vacuous half this repo has been bitten by before.
    const app = wireApp({
      clock: movingClock(1000, 7),
      sink: new RecordingSink(effectSink(fakeWorld().ports)),
      initial: initialState({ tickets: SIX }),
      contextBounds: NARROW,
    });
    expect(app.boundary.contextBounds).toEqual(NARROW);
    app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "recordFinding", input: { text: "noted" } }],
    });
    const digest = must(app.bus.records()[0]).context.digest;
    expect(digest).toBe(render(projectContext(app.initial, [], NARROW)));
    expect(digest).not.toBe(render(projectContext(app.initial, [], DEFAULT_CONTEXT_BOUNDS)));
  });

  it("the TOOLS are handed the WIRED window, not the shipped default", async () => {
    // THE OTHER SIDE OF THE SAME VALUE, and it needs its own instrument. The
    // committed digest and the projection a tool body reads are two calls; a
    // loop that committed under the wired window and showed the model the
    // shipped one left every assertion above green. Measured: `boundary.
    // contextBounds` replaced by the default literal inside `buildTools` moved
    // nothing at all.
    const app = wireApp({
      clock: movingClock(1000, 7),
      sink: new RecordingSink(effectSink(fakeWorld().ports)),
      initial: initialState({ tickets: SIX }),
      contextBounds: NARROW,
    });
    const seen: ContextBounds[] = [];
    const spy = {
      fold: app.dispatchers.fold,
      projectContext(state: State, staged: readonly StagedInput[], bounds: ContextBounds) {
        seen.push(bounds);
        return app.dispatchers.projectContext(state, staged, bounds);
      },
    };
    const tools = buildTools(app.registry, app.boundary, spy, []);
    await must(tools.recordFinding).execute?.(
      { text: "noted" },
      { toolCallId: "call-1", messages: [] },
    );
    expect(seen).toEqual([NARROW]);
  });

  it("a timeline re-derived under a DIFFERENT window diverges at every step", () => {
    const h = harness({ initial: initialState({ tickets: SIX }) });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "T0", level: "High" } }],
    });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "recordFinding", input: { text: "noted" } }],
    });
    const records = h.app.bus.records();
    expect(records.length).toBe(2);

    // SAME bounds — the golden trace, green. This is the ALLOW half, and
    // without it the assertion below would pass on a walk that always diverges.
    expect(
      contextDivergence(h.app.initial, records, h.app.dispatchers, h.app.boundary.contextBounds),
    ).toEqual([]);

    // DIFFERENT bounds — the same committed bytes, a narrower window, and the
    // committed fixture catches it. This is the sentence §6.11 now makes.
    expect(contextDivergence(h.app.initial, records, h.app.dispatchers, NARROW)).toEqual([
      "step 0: context digest diverged",
      "step 1: context digest diverged",
    ]);
  });
});

// ── THE GOLDEN TRACE: a committed side that is a FILE (docs/DECISIONS.md:174) ─
// §6.11 says the committed digest catches a change to the bound. Everything
// above proves the bound THREADS; none of it proves that sentence, because the
// stamping side and the re-deriving side are both code and a moved default
// moves them together. Measured on the tree that shipped the pins: halve both
// defaults, silence the two literal pins, and the whole digest walk stays green
// in both ports.
//
// So the committed side is FROZEN HERE, as text. `contextDivergence` is still
// the only digest checker in the system — it is simply handed a committed side
// it cannot re-derive, which is the one thing it never had.
//
// The digests are literal because a golden built by calling `render` would
// witness itself. Regenerating them is a deliberate edit: any change to what
// the model reads, including a moved default, shows up as a diff in this array.
describe("the digest walk catches a moved default, because the committed side is a file", () => {
  /** Five tickets so `linesPerBlock` above 4 clamps nothing and 4 clamps two
   *  blocks; four notices so `notices` at 3 clamps and at 8 does not. That is
   *  what makes this fixture sensitive to BOTH shipped defaults at once. */
  const FIVE = Array.from({ length: 5 }, (_, i) => ({ id: `T${i}`, body: `body ${i}` }));

  function goldenInitial(): State {
    const base = initialState({ tickets: FIVE, panels: [] });
    return {
      ...base,
      spine: {
        ...base.spine,
        notices: Array.from({ length: 4 }, (_, i) =>
          rejected(100 + i, "setPriority", `reason ${i}`),
        ),
      },
    };
  }

  const GOLDEN: readonly string[] = [
    [
      "staged: none",
      "ticket T0 [Normal]: body 0",
      "ticket T1 [Normal]: body 1",
      "ticket T2 [Normal]: body 2",
      "ticket T3 [Normal]: body 3",
      "ticket T4 [Normal]: body 4",
      "ticket T0: open, may be escalated",
      "ticket T1: open, may be escalated",
      "ticket T2: open, may be escalated",
      "ticket T3: open, may be escalated",
      "ticket T4: open, may be escalated",
      "console: no ticket focused",
      "work product: 0 line(s), draft",
      "rejected setPriority: reason 0",
      "rejected setPriority: reason 1",
      "rejected setPriority: reason 2",
      "rejected setPriority: reason 3",
      "artifact: 0 line(s)",
    ].join("\n"),
    [
      "staged: none",
      "ticket T0 [High]: body 0",
      "ticket T1 [Normal]: body 1",
      "ticket T2 [Normal]: body 2",
      "ticket T3 [Normal]: body 3",
      "ticket T4 [Normal]: body 4",
      "ticket T0: open, may be escalated",
      "ticket T1: open, may be escalated",
      "ticket T2: open, may be escalated",
      "ticket T3: open, may be escalated",
      "ticket T4: open, may be escalated",
      "console: no ticket focused",
      "work product: 0 line(s), draft",
      "rejected setPriority: reason 0",
      "rejected setPriority: reason 1",
      "rejected setPriority: reason 2",
      "rejected setPriority: reason 3",
      "artifact: 0 line(s)",
    ].join("\n"),
  ];

  it("re-derives the FROZEN digests at the shipped window", () => {
    const h = harness({ initial: goldenInitial() });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "T0", level: "High" } }],
    });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "T1", level: "High" } }],
    });

    // The RECORDS are live — `sig` is a sealed branded Signature the spine alone
    // may mint (docs/DECISIONS.md:44), so a synthetic StepRecord is not
    // available and is not wanted. Only the context fixture is substituted, the
    // exact shape the tamper case above already uses.
    const records = h.app.bus.records();
    expect(records.length).toBe(GOLDEN.length);
    const golden = records.map((r, i) => ({
      ...r,
      context: { ...r.context, digest: must(GOLDEN[i]) },
    }));

    // The two goldens are NOT the same string: step 1 sees T0 at [High]. A
    // fixture whose steps were interchangeable would pass a walk that only ever
    // compared step 0.
    expect(GOLDEN[0]).not.toBe(GOLDEN[1]);

    expect(
      contextDivergence(h.app.initial, golden, h.app.dispatchers, DEFAULT_CONTEXT_BOUNDS),
    ).toEqual([]);
  });
});
