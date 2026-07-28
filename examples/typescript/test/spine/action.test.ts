// ── G1 — the name→ToolResult map, and the two paths that share it ──────────
// The shipped reference specified no conversion from what a surface emits to
// what the fold consumes; `ToolResult` was in neither the glossary nor the
// nomenclature table. These tests pin the conversion that now exists.

import { describe, expect, it } from "vitest";
import { HOST, harness } from "../harness";
import { must } from "../support/must";

describe("resolveAction — the one closed name→ToolResult map (G1)", () => {
  it("an unregistered name folds a committed Unhandled, it is not silently dropped", () => {
    const { app, sink } = harness();
    app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "noSuchTool", input: {} }],
    });

    const record = must(app.bus.records().at(-1));
    expect(record.results.at(-1)).toEqual({
      outcome: "unhandled",
      tool: "noSuchTool",
      note: "no registered verb",
    });
    // it is SIGNED too — a refusal is a decision someone may need to ask about
    expect(record.commands.at(-1)).toMatchObject({ outcome: "unhandled", tool: "noSuchTool" });
    expect(sink.performed.map((k) => k.effect.kind)).toEqual(["Diag"]);
    // per-item, never session-global
    expect(app.boundary.state.spine.run.kind).toBe("Idle");
  });

  it("an input that fails to decode folds Unhandled — 6.5's demand, not a dropped action", () => {
    const { app } = harness();
    app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { level: "Nope" } }],
    });

    expect(must(app.bus.records().at(-1)).results.at(-1)).toEqual({
      outcome: "unhandled",
      tool: "setPriority",
      note: "input failed to decode",
    });
  });

  it("the human path and the agent path resolve IDENTICALLY — 3.2 made true", () => {
    const agent = harness();
    agent.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });

    const human = harness();
    human.app.controller.onAction({
      tool: "setPriority",
      input: { ticket: "4118", level: "High" },
    });

    const a = must(agent.app.bus.records().at(-1));
    const h = must(human.app.bus.records().at(-1));

    // the ToolResult, the effects and the state delta are byte-identical …
    expect(h.results).toEqual(a.results);
    expect(human.sink.performed).toEqual(agent.sink.performed);
    expect(human.app.boundary.state.triage).toEqual(agent.app.boundary.state.triage);
    // … and the committed record differs ONLY in the signature
    expect(must(a.commands.at(-1)).sig).toEqual({ by: "Agent", authority: "agent-run-7f" });
    expect(must(h.commands.at(-1)).sig).toEqual({ by: "Human", authority: HOST });
    expect({ ...must(h.commands.at(-1)), sig: null }).toEqual({
      ...must(a.commands.at(-1)),
      sig: null,
    });
  });
});
