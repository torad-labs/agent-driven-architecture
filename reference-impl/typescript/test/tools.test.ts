import { describe, it, expect } from "vitest";
import { initialState } from "../src/domain";
import { focusTicket, setPriority, type Ctx } from "../src/tools";

describe("tools are pure", () => {
  const ctx: Ctx = {
    state: initialState([{ id: "4118", body: "x", priority: "Normal", status: { kind: "Open" } }]),
    actor: "Agent",
  };

  it("a domain tool returns a payload and mutates nothing", () => {
    const r = setPriority.run({ ticket: "4118", level: "High" }, ctx);
    expect(r).toEqual({ kind: "PrioritySet", ticket: "4118", level: "High" });
    // the context is unchanged — the tool was never handed a way to write it
    expect(ctx.state.tickets.get("4118")!.priority).toBe("Normal");
  });

  it("a UI tool reads ctx read-only", () => {
    expect(focusTicket.run({ ticket: "4118" }, ctx)).toEqual({ kind: "Focused", ticket: "4118", known: true });
    expect(focusTicket.run({ ticket: "9999" }, ctx)).toEqual({ kind: "Focused", ticket: "9999", known: false });
  });
});
