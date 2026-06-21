import { describe, it, expect } from "vitest";
import { initialState } from "../src/domain";
import { replay } from "../src/replay";
import type { RecordedStep } from "../src/fold";

describe("replay — the central claim", () => {
  it("re-folds a recorded timeline deterministically to a golden state and golden effects", () => {
    const initial = initialState([
      { id: "4118", body: "refund not received", priority: "Normal", status: { kind: "Open" } },
    ]);

    // a recorded session: the agent set priority and requested escalation;
    // the host then confirmed (a separate authority), which pages on-call.
    const recorded: RecordedStep[] = [
      { now: 1000, results: [{ kind: "PrioritySet", ticket: "4118", level: "High" }] },
      { now: 1001, results: [{ kind: "EscalationRequested", ticket: "4118", by: "Agent" }] },
      { now: 1002, results: [{ kind: "EscalationConfirmed", ticket: "4118", by: "Human" }] },
    ];

    // `replay` folds twice and asserts the two are identical — it throws if not.
    const { state, effects } = replay(initial, recorded);

    const t = state.tickets.get("4118")!;
    expect(t.priority).toBe("High");
    expect(t.status.kind).toBe("Escalated");

    expect(effects).toEqual([
      { kind: "Log", what: "priority", ticket: "4118", level: "High", at: 1000 },
      { kind: "PageOncall", ticket: "4118", at: 1002 },
    ]);
  });
});
