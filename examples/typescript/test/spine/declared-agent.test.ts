// ── SDK-3 / AGENT-LOOP — the agent is DECLARED once, not rebuilt per turn ────
// `runTurn` called `generateText` and rebuilt the ENTIRE tool table from the
// registry on every turn. The SDK's own docs name `ToolLoopAgent` the
// recommended approach and reserve the core functions for "when you need
// explicit control over each step" — so this port took the escape hatch as its
// default while its whole thesis is declarative composition from a registry.
//
// WHAT MADE THE TABLE PER-TURN, and why fixing it was not cosmetic: `buildTools`
// closed over `staged`, which varies per turn. A table that closes over a
// per-turn value CANNOT outlive the turn. Moving `staged` onto the call's
// context (spine/pure/staged `TurnScope`) is what let the table become a
// function of the registry alone.
//
// THE ASSERTION IS OBJECT IDENTITY, deliberately. "Built once" is not observable
// from code shape — a refactor that still rebuilt an identical-looking table
// would read the same in review and pass any structural check. Holding the table
// across two turns and asserting it is the SAME OBJECT is the only form of this
// claim that can fail.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_STEPS, declareAgent } from "../../src/spine/agent/loop";
import { perceived } from "../../src/spine/pure/staged";
import { harness } from "../harness";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function speaker(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "done" }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

/** Never stops on its own — the only thing that ends this turn is the ceiling. */
function looper(count: { n: number }): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      count.n += 1;
      return {
        content: [
          {
            type: "tool-call" as const,
            toolCallId: `t${count.n}`,
            toolName: "setPriority",
            input: JSON.stringify({ ticket: "4118", level: "High" }),
          },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

describe("SDK-3 — one declaration, many turns", () => {
  it("builds the tool table ONCE and reuses the same object across turns", async () => {
    const h = harness();
    const declared = declareAgent({
      model: speaker(),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    const before = declared.tools;
    await declared.run({ prompt: "first" });
    await declared.run({ prompt: "second", staged: [perceived("inbox", "later", "k2")] });

    expect(declared.tools).toBe(before);
  });

  it("serves DIFFERENT staged input per turn from one declaration", async () => {
    const h = harness();
    const seen: string[] = [];
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        const prompt = options.prompt as ReadonlyArray<{ content?: unknown }>;
        seen.push(JSON.stringify(prompt));
        return {
          content: [{ type: "text" as const, text: "done" }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        };
      },
    });

    const declared = declareAgent({
      model,
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    await declared.run({ prompt: "a", staged: [perceived("inbox", "FIRST-BODY", "k1")] });
    await declared.run({ prompt: "b", staged: [perceived("inbox", "SECOND-BODY", "k2")] });

    // The table is shared; the per-turn scope is not. If `staged` were still
    // captured by the table, turn 2 would carry turn 1's body.
    expect(seen[0]).toContain("FIRST-BODY");
    expect(seen[0]).not.toContain("SECOND-BODY");
    expect(seen[1]).toContain("SECOND-BODY");
    expect(seen[1]).not.toContain("FIRST-BODY");
  });

  it("takes the step ceiling from the ROOT, not from a constant welded into the loop", async () => {
    const h = harness();
    const count = { n: 0 };
    const declared = declareAgent({
      model: looper(count),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      maxSteps: 3,
    });

    await declared.run({ prompt: "loop forever" });

    expect(count.n).toBe(3);
    expect(count.n).not.toBe(DEFAULT_MAX_STEPS);
  });

  it("falls back to the SHIPPED ceiling when the root says nothing", async () => {
    const h = harness();
    const count = { n: 0 };
    const declared = declareAgent({
      model: looper(count),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    await declared.run({ prompt: "loop forever" });

    expect(count.n).toBe(DEFAULT_MAX_STEPS);
  });
});
