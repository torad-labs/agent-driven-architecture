// ── SDK-2 + SDK-9 / MODEL-PORT + TELEMETRY — the seam stops discarding ───────
// `ModelProvider.runTurn` returned `{ steps: number, text: string }`. Everything
// else the runtime produced — token usage, finish reason, warnings, tool calls,
// reasoning, sources, provider metadata — was dropped at the seam. Two concrete
// consequences, both invisible to a caller:
//
//   · a TRUNCATED answer (`finishReason: "length"`) is indistinguishable from a
//     complete one, because `text` looks the same either way;
//   · a turn cannot be billed or budgeted at all.
//
// WHAT THIS DOES NOT DO, deliberately. The audit's original phrasing was
// "LanguageModel IS the port; re-abstracting it is a worse copy of the standard".
// That argues for deleting the seam, and the seam is a LOCKED decision — C11
// keeps this file interfaces-only, and confining the runtime to one spine module
// is the architecture, not an accident. So the port stays SDK-free and stays a
// port. What was actually wrong is the only thing fixed: it was two fields wide.
//
// `usage` IS THE WHOLE TURN. `result.usage` is the final step only; a seam that
// reported it would under-bill every turn that used a tool, which is the
// documented multi-step undercounting trap.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { declareAgent } from "../../src/spine/agent/loop";
import { harness } from "../harness";

function model(
  finish: "stop" | "length",
  input: number,
  output: number,
  warnings: readonly { type: "other"; message: string }[] = [],
): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "partial answer" }],
      finishReason: { unified: finish, raw: undefined },
      usage: {
        inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: output, text: output, reasoning: undefined },
      },
      warnings: [...warnings],
    }),
  });
}

function run(h: ReturnType<typeof harness>, m: MockLanguageModelV3) {
  return declareAgent({
    model: m,
    boundary: h.app.boundary,
    registry: h.app.registry,
    dispatchers: h.app.dispatchers,
  }).run({ prompt: "go" });
}

/** Two steps with DISTINCT usage: a tool-call step, then a text step.
 *
 *  REVIEW FINDING. The single-step fixture this replaced could not tell
 *  `totalUsage` from `usage`, because on one step they are the same number. A
 *  regression from whole-turn to final-step accounting would have kept every
 *  assertion green while under-billing every turn that used a tool — which is
 *  the exact trap the mapper's own comment warns about. */
function twoStepModel(): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      call += 1;
      if (call === 1) {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "t1",
              toolName: "setPriority",
              input: JSON.stringify({ ticket: "4118", level: "High" }),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage: {
            inputTokens: { total: 11, noCache: 11, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 7, text: 7, reasoning: undefined },
          },
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: "partial answer" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: { total: 13, noCache: 13, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

describe("SDK-2/SDK-9 — the turn outcome carries what the runtime produced", () => {
  it("sums usage across the WHOLE turn, not just the final step", async () => {
    const out = await run(harness(), twoStepModel());

    // 11+13 in, 7+5 out. Final-step accounting would report 13/5/18 and this
    // fails; that is the whole point of the fixture.
    expect(out.steps).toBe(2);
    expect(out.usage).toEqual({ inputTokens: 24, outputTokens: 12, totalTokens: 36 });
  });

  it("reports token usage instead of discarding it", async () => {
    const out = await run(harness(), model("stop", 11, 7));

    expect(out.usage.inputTokens).toBe(11);
    expect(out.usage.outputTokens).toBe(7);
    expect(out.usage.totalTokens).toBe(18);
  });

  it("surfaces a TRUNCATED answer — the case `text` alone cannot reveal", async () => {
    const complete = await run(harness(), model("stop", 1, 1));
    const truncated = await run(harness(), model("length", 1, 1));

    // Identical text, different verdict. Before this, a caller had no way to
    // tell these two apart.
    expect(complete.text).toBe(truncated.text);
    expect(complete.finishReason).toBe("stop");
    expect(truncated.finishReason).toBe("length");
  });

  it("carries provider warnings rather than swallowing them", async () => {
    const out = await run(
      harness(),
      model("stop", 1, 1, [{ type: "other", message: "topK unsupported" }]),
    );

    expect(out.warnings.length).toBe(1);
    expect(out.warnings[0]).toContain("topK unsupported");
  });

  it("still reports steps and text — the two fields it always had", async () => {
    const out = await run(harness(), model("stop", 1, 1));

    expect(out.steps).toBe(1);
    expect(out.text).toBe("partial answer");
  });
});
