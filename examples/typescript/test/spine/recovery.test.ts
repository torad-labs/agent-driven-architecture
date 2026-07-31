// ── G9 — recovery is idempotent, and timestamps round-trip ─────────────────
//
// G9, MEASURED: the same confirm applied twice → PageOncall fired TWICE, both
// at:9. The effect idempotency key 14.6 rests its whole recovery-path safety
// claim on was read in three places and constructed in none.
//
// G9, MEASURED: a RecordingBus after a step folded at now=9 had keys
// ['commands','results'] and contained no 'now'. Live at:1001 → re-folded at:0.

import { describe, expect, it } from "vitest";
import { effectSink } from "../../src/app/wire";
import { DedupingSink } from "../../src/spine/boundary/in-memory";
import { collectPerform, refold } from "../../src/spine/replay/replay";
import { fakeWorld, harness, POLICY_TIER } from "../harness";
import { must } from "../support/must";

function driveToAPage(h: ReturnType<typeof harness>): void {
  h.app.boundary.onStepFinish({
    by: "Agent",
    staged: [],
    actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
  });
  h.actAs("Agent", POLICY_TIER);
  h.app.boundary.onStepFinish({
    by: "Agent",
    staged: [],
    actions: [{ tool: "confirmEscalation", input: { ticket: "4118" } }],
  });
}

describe("G9 — `now` rides the committed record", () => {
  it("every timestamp round-trips through the bus under a MOVING clock", () => {
    const h = harness({ start: 1000, step: 7 });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });
    driveToAPage(h);

    expect(h.app.bus.records().map((r) => r.now)).toEqual([1000, 1007, 1014]);

    const replayed = refold(h.app.initial, h.app.bus.records(), h.app.dispatchers, h.app.licences);
    expect(replayed.effects.map((k) => k.effect.at)).toEqual(
      h.sink.performed.map((k) => k.effect.at),
    );
    expect(replayed.effects.map((k) => k.effect.at)).toEqual([1000, 1014]);
    expect(replayed.state).toEqual(h.app.boundary.state);
  });
});

describe("G9 — RECOVERY re-drives a timeline exactly once", () => {
  it("a deduping sink keyed on the committed index pages on-call ONCE across two crashes", () => {
    const h = harness({ start: 1000, step: 7 });
    driveToAPage(h);
    expect(h.world.pages).toEqual(["4118"]);

    const recovery = fakeWorld();
    const sink = new DedupingSink(effectSink(recovery.ports));
    collectPerform(
      h.app.initial,
      h.app.bus.records(),
      h.app.dispatchers,
      h.app.licences,
      sink,
      "RECOVERY",
    );
    collectPerform(
      h.app.initial,
      h.app.bus.records(),
      h.app.dispatchers,
      h.app.licences,
      sink,
      "RECOVERY",
    );

    expect(sink.fired.filter((k) => k.effect.kind === "PageOncall")).toHaveLength(1);
    expect(recovery.world.pages).toEqual(["4118"]);
  });

  it("the key is (committed step, index within step) — it cannot be minted by the fold", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [
        { tool: "setPriority", input: { ticket: "4118", level: "High" } },
        { tool: "setPriority", input: { ticket: "9999", level: "High" } },
      ],
    });
    // one effect (the 9999 arm rejected and emitted none) → index 0 of step 0
    expect(h.sink.performed.map((k) => k.key)).toEqual([{ step: 0, index: 0 }]);
    // and no Effect variant carries an id at all
    expect(Object.keys(must(h.sink.performed[0]).effect).includes("id")).toBe(false);
  });
});
