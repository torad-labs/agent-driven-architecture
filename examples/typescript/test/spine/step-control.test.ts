// ── SDK-4 / STEP-CONTROL — `activeTools`, and what it does NOT replace ───────
// 11.4's registry allowlist (ALL_BLOCKS / FAST_TIER / DEEP_TIER in app/wire) is a
// LOCKED decision: it is the only place in the system that says which agents are
// permitted to exist, and this item does not relitigate it. A tier that must not
// hold a verb still must not hold it — the registry, not a call setting, is what
// makes `analysis.register("fast")` unable to publish.
//
// WHAT `activeTools` ADDS, which the registry cannot express: narrowing WITHIN a
// registry, per declaration and per step, without forking the table. The registry
// answers "may this stream ever run this verb?"; `activeTools` answers "may it run
// it right now?". Two different questions, and only the first one was answerable
// before.
//
// The distinction matters for the double-check the SDK gives free: a verb absent
// from `activeTools` is not offered to the model AT ALL, so a tier restriction
// stops depending on the model declining to call something it can see.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { declareAgent } from "../../src/spine/agent/loop";
import { harness } from "../harness";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Captures the tool names the provider was actually offered. */
function toolSpy(seen: string[][]): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      const tools = (options.tools ?? []) as ReadonlyArray<{ name?: string }>;
      seen.push(tools.map((t) => t.name ?? ""));
      return {
        content: [{ type: "text" as const, text: "done" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

describe("SDK-4 — activeTools narrows within a registry", () => {
  it("offers the WHOLE registry when the declaration names no subset", async () => {
    const h = harness();
    const seen: string[][] = [];
    await declareAgent({
      model: toolSpy(seen),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    }).run({ prompt: "go" });

    expect(seen[0]).toContain("setPriority");
    expect(seen[0]).toContain("requestEscalation");
    expect((seen[0] ?? []).length).toBe(h.app.registry.size);
  });

  it("offers ONLY the named subset — an unlisted verb never reaches the model", async () => {
    const h = harness();
    const seen: string[][] = [];
    await declareAgent({
      model: toolSpy(seen),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      activeTools: ["setPriority"],
    }).run({ prompt: "go" });

    expect(seen[0]).toEqual(["setPriority"]);
    // The point of the mechanism: the restriction does not depend on the model
    // declining to call something it can see. It cannot see it.
    expect(seen[0]).not.toContain("requestEscalation");
  });

  it("does NOT weaken the registry — a verb outside the registry stays outside", async () => {
    const h = harness();
    const seen: string[][] = [];
    // Naming a verb the registry never registered must not conjure it: the
    // registry remains the authority on what may exist (11.4).
    await declareAgent({
      model: toolSpy(seen),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      activeTools: ["setPriority", "notARegisteredVerb"],
    }).run({ prompt: "go" });

    expect(seen[0]).toContain("setPriority");
    expect(seen[0]).not.toContain("notARegisteredVerb");
  });
});
