import { describe, it, expect } from "vitest";
import { initialState } from "../src/domain";
import { Boundary, fixedClock, sequentialIds, type Bus, type Sink } from "../src/boundary";
import type { Command } from "../src/command";
import type { Effect } from "../src/effect";
import type { ToolResult } from "../src/tool-result";

describe("the boundary adapter — the one impure seam", () => {
  it("commits before it performs, and stamps the actor exactly once", () => {
    const order: string[] = [];
    const bus: Bus = {
      append: (cmds) => order.push(`append ${cmds.map((c) => `${c.kind}:${c.by}:${c.id}`).join(",")}`),
    };
    const sink: Sink = { perform: (fx) => order.push(`perform ${fx.kind}`) };

    const b = new Boundary(
      fixedClock(42),
      sequentialIds("c"),
      bus,
      sink,
      initialState([{ id: "4118", body: "x", priority: "Normal", status: { kind: "Open" } }]),
    );

    b.onStepFinish({ actor: "Agent", results: [{ kind: "PrioritySet", ticket: "4118", level: "High" }] });

    // commit (the signed command, actor stamped) strictly before perform
    expect(order).toEqual(["append SetPriority:Agent:c1", "perform Log"]);
    expect(b.state.tickets.get("4118")!.priority).toBe("High");
  });

  it("never forges the actor — a human action carries Human through the same path", () => {
    const seen: Command[] = [];
    const bus: Bus = { append: (cmds) => seen.push(...cmds) };
    const sink: Sink = { perform: (_fx: Effect) => {} };
    const b = new Boundary(
      fixedClock(1),
      sequentialIds(),
      bus,
      sink,
      initialState([{ id: "4118", body: "x", priority: "Normal", status: { kind: "Open" } }]),
    );

    const result: ToolResult = { kind: "PrioritySet", ticket: "4118", level: "Urgent" };
    b.onStepFinish({ actor: "Human", results: [result] });

    expect(seen[0]).toMatchObject({ kind: "SetPriority", by: "Human" });
  });
});
