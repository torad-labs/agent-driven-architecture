// ── A1 — a PRESENTATION verb folds AND signs, identically to a domain verb ─
// 6.8 bought a cheaper UI tool (1 declared site vs 3) at the cost of TWO tool
// mechanics. These tests pin the one mechanic: the committed record for
// `setPanel` has exactly the shape the record for `setPriority` has.

import { describe, expect, it } from "vitest";
import { consoleBlock } from "../../src/blocks/console/register";
import { initialViewState } from "../../src/blocks/console/view-state";
import { authority, Signature } from "../../src/spine/pure/actor";
import { harness } from "../harness";
import { must } from "../support/must";

const sig = new Signature("Agent", authority("agent-run-7f"));
const slice = consoleBlock.sliceOf(["escalation", "findings"]);

describe("blocks/console — presentation is an authored act (A1)", () => {
  it("an agent repositioning the interface MINTS A COMMAND, signed like any other", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPanel", input: { panel: "escalation", visible: false } }],
    });

    const record = must(h.app.bus.records().at(-1));
    expect(record.commands.at(-1)).toEqual({
      outcome: "ok",
      tool: "setPanel",
      sig: { by: "Agent", authority: "agent-run-7f" },
      id: "cmd1",
      panel: "escalation",
      visible: false,
    });
    expect(h.app.boundary.state.console.panels.get("escalation")).toBe(false);
    // "why did the escalation panel disappear?" is answerable from the bus
    expect(record.actions).toEqual([
      { tool: "setPanel", input: { panel: "escalation", visible: false } },
    ]);
  });

  it("a presentation verb and a domain verb produce records of the SAME shape", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [
        { tool: "setPriority", input: { ticket: "4118", level: "High" } },
        { tool: "focusTicket", input: { ticket: "4118" } },
      ],
    });

    const [domain, presentation] = must(h.app.bus.records().at(-1)).commands;
    expect(
      Object.keys(must(domain))
        .filter((k) => !["ticket", "level"].includes(k))
        .sort(),
    ).toEqual(
      Object.keys(must(presentation))
        .filter((k) => k !== "ticket")
        .sort(),
    );
    expect(must(domain).sig).toEqual(must(presentation).sig);
  });

  it("the arm obeys the same three rules — an unknown panel is a per-item Rejected", () => {
    const out = consoleBlock.arm(
      slice,
      { outcome: "ok", tool: "setPanel", panel: "nope", visible: true },
      5,
      sig,
    );

    expect(out.slice).toBe(slice);
    expect(out.notices).toEqual([
      { kind: "Rejected", at: 5, tool: "setPanel", reason: "unknown panel nope" },
    ]);
  });

  it("EPHEMERAL view-state never folds and never signs (4.6, untouched)", () => {
    const focused = consoleBlock.arm(
      slice,
      { outcome: "ok", tool: "focusTicket", ticket: "4118" },
      5,
      sig,
    ).slice;

    // hover decorates the view …
    const view = consoleBlock.view(focused, {
      ...initialViewState,
      hoveredTicket: "4118",
      scrollOffset: 320,
    });
    expect(view.hoveredTicket).toBe("4118");
    // … and is absent from the slice and from the reasoner's digest
    expect(JSON.stringify(focused)).not.toContain("hovered");
    expect(consoleBlock.contextLines(focused).join(" ")).not.toContain("hover");
    expect(consoleBlock.contextLines(focused)).toContain("console: focused on 4118");
  });
});
