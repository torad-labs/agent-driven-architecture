// ── The nine ordered steps, and the three facts that fall out of the order ─

import { describe, expect, it } from "vitest";
import { projectContext } from "../../src/app/assemble";
import { render } from "../../src/spine/pure/context";
import { perceived } from "../../src/spine/pure/staged";
import { harness } from "../harness";
import { must } from "../support/must";

describe("the boundary — the one impure seam", () => {
  it("COMMITS before it PERFORMS, because the effect key comes from the commit (G9)", () => {
    const order: string[] = [];
    const h = harness();
    const bus = h.app.bus;
    const realAppend = bus.append.bind(bus);
    // instrumenting the ports for an ordering assertion only
    bus.append = (record) => {
      order.push("append");
      return realAppend(record);
    };
    const realPerform = h.sink.perform.bind(h.sink);
    h.sink.perform = (keyed, mode) => {
      order.push(`perform ${keyed.effect.kind}`);
      realPerform(keyed, mode);
    };

    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });

    expect(order).toEqual(["append", "perform LogDecision"]);
  });

  it("keys every effect from the COMMITTED step index and its position in the step", () => {
    const h = harness();
    h.app.boundary.agent.submit({
      staged: [],
      actions: [
        { tool: "setPriority", input: { ticket: "4118", level: "High" } },
        { tool: "noSuchTool", input: {} },
      ],
    });
    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "Urgent" } }],
    });

    expect(h.sink.performed.map((k) => k.key)).toEqual([
      { step: 0, index: 0 },
      { step: 0, index: 1 },
      { step: 1, index: 0 },
    ]);
  });

  it("commits the STEP — `now`, the stamp, the actions, the post-gate results and the context (G9)", () => {
    const h = harness({ start: 1000, step: 7 });
    const before = h.app.boundary.state;
    h.app.boundary.agent.submit({
      staged: [perceived("inbox", "customer wrote in", "inbox-1")],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });

    const record = must(h.app.bus.records()[0]);
    // The 14.7 envelope plus the fields the step is. The pin is a key SET
    // rather than a count, so a field added or renamed is a diff here.
    expect(Object.keys(record).sort()).toEqual([
      "actions",
      "commands",
      "context",
      "now",
      "results",
      "schemaVersion",
      "sig",
      "staged",
    ]);
    expect(record.now).toBe(1000);
    expect(record.staged).toEqual([perceived("inbox", "customer wrote in", "inbox-1")]);
    expect(record.actions).toEqual([
      { tool: "setPriority", input: { ticket: "4118", level: "High" } },
    ]);
    // the captured context fixture is re-derivable from the state BEFORE the step
    expect(record.context.promptVersion).toBe("prompt-v1");
    expect(record.context.digest).toBe(render(projectContext(before, record.staged)));
  });

  it("stamps `sig` AFTER every tool has returned — nothing upstream can forge it", () => {
    const h = harness();
    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });
    const record = must(h.app.bus.records()[0]);
    // no ToolResult carries an actor, an authority or a signature — at all
    expect(JSON.stringify(record.results)).not.toContain("Agent");
    expect(JSON.stringify(record.results)).not.toContain("agent-run-7f");
    expect(record.sig).toEqual({ by: "Agent", authority: "agent-run-7f" });
  });
});
