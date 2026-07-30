// ── blocks/triage in ISOLATION — no siblings, no root, no live adapters ────
//
// 12.4, MEASURED against the shipped reference: setPriority on unknown ticket
// 9999 performed Effect.Log{ticket:"9999"}, committed SetPriority(…,"9999"),
// left folded state UNCHANGED — a clean-looking audit record for a mutation
// that never happened — and flipped the session banner to "degraded" for the
// rest of the session.

import { describe, expect, it } from "vitest";
import { triage } from "../../src/blocks/triage/register";
import { authority, Signature } from "../../src/spine/pure/actor";
import { harness } from "../harness";

const sig = new Signature("Agent", authority("agent-run-7f"));
const slice = triage.sliceOf([{ id: "4118", body: "refund not received" }]);

describe("blocks/triage — the arm reads state before it decides (§12.4)", () => {
  it("a valid transition folds, and the effect fires from the SUCCESS branch", () => {
    const out = triage.arm(
      slice,
      { outcome: "ok", tool: "setPriority", ticket: "4118", level: "High", reason: null },
      5,
      sig,
    );

    expect(out.slice.priority.get("4118")).toBe("High");
    expect(out.effects).toEqual([
      {
        kind: "LogDecision",
        at: 5,
        ticket: "4118",
        level: "High",
        supersedes: "Normal",
        reason: null,
      },
    ]);
    expect(out.notices).toEqual([]);
    // copy-on-write: the input slice is untouched
    expect(slice.priority.get("4118")).toBe("Normal");
  });

  it("an unknown ticket: NO effect, exactly one per-item Rejected, slice unchanged", () => {
    const out = triage.arm(
      slice,
      { outcome: "ok", tool: "setPriority", ticket: "9999", level: "High", reason: null },
      5,
      sig,
    );

    expect(out.effects).toEqual([]);
    expect(out.notices).toEqual([
      { kind: "Rejected", at: 5, tool: "setPriority", reason: "unknown ticket 9999" },
    ]);
    expect(out.slice).toBe(slice);
  });

  it("end to end: a rejected item never touches the session banner", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "9999", level: "High" } }],
    });

    expect(h.sink.performed).toEqual([]);
    expect(h.app.boundary.state.spine.notices).toEqual([
      { kind: "Rejected", at: 1000, tool: "setPriority", reason: "unknown ticket 9999" },
    ]);
    expect(h.app.boundary.state.spine.run.kind).toBe("Idle");
    expect(h.app.controller.view.banner).toBe("ok");
    // the next good item is unaffected — no sticky session state
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "Urgent" } }],
    });
    expect(h.app.controller.view.banner).toBe("ok");
    expect(h.app.boundary.state.triage.priority.get("4118")).toBe("Urgent");
  });

  it("the ticket input stays an OPEN string — the ARM validates, not the schema (6.10)", () => {
    const view = triage.view(slice);
    expect(view.rows).toEqual([{ ticket: "4118", badge: "NORMAL", priority: "Normal" }]);
    expect(triage.contextLines(slice)).toEqual(["ticket 4118 [Normal]: refund not received"]);
  });
});
