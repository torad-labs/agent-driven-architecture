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
import { RecordingSink } from "../../src/spine/boundary/in-memory";
import { collectPerform, refold } from "../../src/spine/replay/replay";
import { fakeWorld, harness, POLICY_TIER } from "../harness";

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
