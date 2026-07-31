// ── G16 — the artifact is a folded slice, compared BY VALUE ────────────────
// The regression the old shape could not catch: a reducer change that corrupts
// artifact content while leaving State byte-identical. It cannot exist here,
// because the content IS State — so the golden STATE assertion is the content
// assertion.

import { refold } from "@adr/spine/replay/replay";
import { describe, expect, it } from "vitest";
import { harness, POLICY_TIER } from "../../../test/harness";
import { must } from "../../../test/support/must";

function record(h: ReturnType<typeof harness>, ...texts: string[]): void {
  h.app.boundary.onStepFinish({
    by: "Agent",
    staged: [],
    actions: texts.map((text) => ({ tool: "recordFinding", input: { text } })),
  });
}

describe("blocks/artifact — a folded slice, delivered once at seal (G16)", () => {
  it("lines fold; the seal delivers EXACTLY ONE irreversible effect", () => {
    const h = harness({ start: 1000, step: 7 });
    record(h, "first", "second");
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "requestSeal", input: {} }],
    });
    h.app.controller.onAction({ tool: "confirmSeal", input: {} }); // a DIFFERENT authority

    expect(h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual(["first", "second"]);
    expect(h.app.boundary.state.artifact.lines.map((l) => l.by)).toEqual(["Agent", "Agent"]);
    expect(h.app.boundary.state.artifact.seal.kind).toBe("Sealed");
    expect(h.sink.performed.filter((k) => k.effect.kind === "DeliverArtifact")).toHaveLength(1);
    expect(h.world.deliveries).toEqual([2]);
    // recording a finding performs NOTHING — it is truth, not an action
    expect(h.sink.performed.filter((k) => k.effect.kind !== "DeliverArtifact")).toEqual([]);
  });

  it("the content re-folds from committed bytes — 2.2 made true", () => {
    const h = harness({ start: 1000, step: 7 });
    record(h, "first", "second");
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "requestSeal", input: {} }],
    });
    h.app.controller.onAction({ tool: "confirmSeal", input: {} });

    const replayed = refold(h.app.initial, h.app.bus.records(), h.app.dispatchers, h.app.licences);
    expect(replayed.state.artifact).toEqual(h.app.boundary.state.artifact);
    expect(replayed.effects.filter((k) => k.effect.kind === "DeliverArtifact")).toEqual(
      h.sink.performed.filter((k) => k.effect.kind === "DeliverArtifact"),
    );
  });

  it("a self-confirmed seal is refused — session-end is gated exactly as 14.3 says", () => {
    const h = harness({ start: 1000, step: 7 });
    record(h, "only");
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "requestSeal", input: {} }],
    });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "confirmSeal", input: {} }],
    });

    expect(h.world.deliveries).toEqual([]);
    expect(must(h.app.bus.records().at(-1)).results.at(-1)).toMatchObject({
      outcome: "refused",
      tool: "confirmSeal",
    });

    // a different principal on the same stream may seal it (G6)
    h.actAs("Agent", POLICY_TIER);
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "confirmSeal", input: {} }],
    });
    expect(h.world.deliveries).toEqual([1]);
  });

  it("a sealed artifact refuses further lines, per item", () => {
    const h = harness({ start: 1000, step: 7 });
    record(h, "only");
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "requestSeal", input: {} }],
    });
    h.app.controller.onAction({ tool: "confirmSeal", input: {} });
    record(h, "too late");

    expect(h.app.boundary.state.artifact.lines.map((l) => l.text)).toEqual(["only"]);
    expect(h.app.boundary.state.spine.notices.at(-1)).toMatchObject({
      kind: "Rejected",
      tool: "recordFinding",
    });
    expect(h.app.controller.view.banner).toBe("ok");
  });
});
