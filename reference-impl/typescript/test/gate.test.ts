import { describe, it, expect } from "vitest";
import { initialState, type TicketStatus } from "../src/domain";
import { fold } from "../src/fold";

function escalating(by: "Human" | "Agent" = "Agent") {
  const status: TicketStatus = { kind: "Escalating", by };
  return initialState([{ id: "4118", body: "x", priority: "High", status }]);
}

describe("the irreversible-action gate", () => {
  it("pages on a host (Human) confirm", () => {
    const [s, fx] = fold(escalating(), [{ kind: "EscalationConfirmed", ticket: "4118", by: "Human" }], 5);
    expect(s.tickets.get("4118")!.status.kind).toBe("Escalated");
    expect(fx).toEqual([{ kind: "PageOncall", ticket: "4118", at: 5 }]);
  });

  it("denies an agent self-confirm — no page fires", () => {
    const [s, fx] = fold(escalating(), [{ kind: "EscalationConfirmed", ticket: "4118", by: "Agent" }], 5);
    // status unchanged: still Escalating, never Escalated
    expect(s.tickets.get("4118")!.status.kind).toBe("Escalating");
    expect(fx).toEqual([{ kind: "Diag", note: "denied: agent self-confirm" }]);
    expect(fx.some((e) => e.kind === "PageOncall")).toBe(false);
  });
});
