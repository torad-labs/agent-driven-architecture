// ── G15 — the reasoner's input is a named, typed, BOUNDED projection ───────
// The shipped reference had one sentence for this seam: no type, no projection,
// no bound, no capture rule, no invariant, no test layer. Below is the test
// layer.

import { describe, expect, it } from "vitest";
import { projectContext } from "../../src/app/assemble";
import { initialState } from "../../src/app/contract";
import {
  MAX_CONTEXT_LINES_PER_BLOCK,
  MAX_CONTEXT_NOTICES,
  render,
} from "../../src/spine/pure/context";
import { rejected } from "../../src/spine/pure/notice";
import { perceived } from "../../src/spine/pure/staged";
import { contextDivergence } from "../../src/spine/replay/replay";
import { harness } from "../harness";

describe("projectContext — the THIRD pure projection (G15)", () => {
  it("is a projection of committed State plus the ONE staged input", () => {
    const state = initialState({ tickets: [{ id: "4118", body: "refund not received" }] });
    const staged = [perceived("inbox", "customer wrote in", "inbox-1")];
    const context = projectContext(state, staged);

    expect(context.staged).toEqual(staged);
    expect(context.artifactLineCount).toBe(0);
    expect(context.lines).toContain("ticket 4118 [Normal]: refund not received");
    expect(context.lines).toContain("ticket 4118: open, may be escalated");
    // calling it twice on the same input is the same value — it accumulates nothing
    expect(projectContext(state, staged)).toEqual(context);
  });

  it("is O(1) in timeline length: 500 tickets and 200 notices stay within the caps", () => {
    const tickets = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, body: `body ${i}` }));
    const base = initialState({ tickets });
    const state = {
      ...base,
      spine: {
        ...base.spine,
        notices: Array.from({ length: 200 }, (_, i) => rejected(i, "setPriority", `reason ${i}`)),
      },
    };

    const context = projectContext(state, []);
    // four blocks, each capped
    expect(context.lines.length).toBeLessThanOrEqual(4 * MAX_CONTEXT_LINES_PER_BLOCK);
    expect(context.notices.length).toBe(MAX_CONTEXT_NOTICES);
    // the artifact enters by COUNT, never by content
    expect(context.artifactLineCount).toBe(0);
    expect(render(context).length).toBeLessThan(4000);
  });

  it("the committed digest is re-derivable from committed State — the fixture IS a check", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [perceived("inbox", "urgent", "inbox-2")],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "recordFinding", input: { text: "noted" } }],
    });

    expect(contextDivergence(h.app.initial, h.app.bus.records(), h.app.dispatchers)).toEqual([]);
  });

  it("a change to what the model saw fails the golden trace without re-running the model", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "High" } }],
    });

    const tampered = h.app.bus.records().map((r) => ({
      ...r,
      context: { ...r.context, digest: `${r.context.digest} (and one more thing)` },
    }));
    expect(contextDivergence(h.app.initial, tampered, h.app.dispatchers)).toEqual([
      "step 0: context digest diverged",
    ]);
  });
});
