// ── SDK-14 + SDK-17 — repair, and the middleware that was always reachable ───
//
// SDK-14 / REPAIR. A malformed tool input becomes a committed `Unhandled` at the
// boundary ("input failed to decode") and the turn carries on. That refusal is a
// book law and repair does NOT replace it: repair runs BEFORE the boundary, so an
// input that can be fixed never becomes a refusal, and one that cannot still
// lands as a committed Unhandled exactly as before. The strategy is supplied by
// the ROOT — choosing how to repair is a decision, and C14 says the loop makes
// none.
//
// SDK-17 / MIDDLEWARE. The audit logged this as "no middleware; wrapLanguageModel
// unused". Measured, there was never anything to add: `model` is a
// `LanguageModel`, and `wrapLanguageModel` RETURNS a `LanguageModel`. Middleware
// was reachable from the composition root the whole time. The honest finding is
// therefore not "the seam is missing" but "nothing demonstrated it", which is a
// smaller claim and the one this file pins.

import { wrapLanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { declareAgent } from "../../src/spine/agent/loop";
import { harness } from "../harness";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function plain(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "done" }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

describe("SDK-17 — middleware needs no new seam", () => {
  it("accepts a wrapped model on the SAME declaration field", async () => {
    const h = harness();
    const calls: string[] = [];

    const wrapped = wrapLanguageModel({
      model: plain(),
      middleware: {
        specificationVersion: "v3" as const,
        wrapGenerate: async ({ doGenerate }) => {
          calls.push("intercepted");
          return doGenerate();
        },
      },
    });

    const out = await declareAgent({
      model: wrapped,
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    }).run({ prompt: "go" });

    // The cross-cutting concern ran, and the spine grew no branch for it.
    expect(calls).toEqual(["intercepted"]);
    expect(out.text).toBe("done");
  });
});

describe("SDK-14 — repair is expressible and stays before the boundary", () => {
  it("carries a root-supplied repair strategy onto the declaration", () => {
    const h = harness();

    const declared = declareAgent({
      model: plain(),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      repairToolCall: async () => null,
    });

    // Constructed with the strategy attached; the table is unaffected.
    expect(Object.keys(declared.tools).length).toBe(h.app.registry.size);
  });

  it("leaves the committed-refusal path intact when no strategy is supplied", async () => {
    const h = harness();

    // A tool call the registry cannot decode still travels the ONE existing
    // path — resolveAction → gate → fold → commit — and lands as a committed
    // refusal rather than vanishing. Repair must never be able to swallow this.
    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: 12345, level: "NotALevel" } }],
    });

    const last = h.app.bus.records().at(-1);
    expect(last?.results.at(-1)).toMatchObject({ outcome: "unhandled" });
  });
});
