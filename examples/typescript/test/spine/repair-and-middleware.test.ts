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

describe("SDK-14 — repair runs through the declared agent", () => {
  // REVIEW FINDING. The first version of these two cases supplied
  // `repairToolCall` and then asserted only `Object.keys(declared.tools).length`,
  // while the refusal case called `boundary.agent.submit` directly. Deleting
  // `experimental_repairToolCall: declaration.repairToolCall` from the agent left
  // BOTH green, because neither ever invoked the hook. They tested that a field
  // could be passed, not that it did anything.
  //
  // Both now drive the real path: a malformed call from the model, through the
  // declared agent, to what the boundary commits.

  /** Emits one malformed `setPriority` call, then stops. */
  function modelCalling(input: string): MockLanguageModelV3 {
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
                input,
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage,
            warnings: [],
          };
        }
        return {
          content: [{ type: "text" as const, text: "done" }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        };
      },
    });
  }

  const MALFORMED = JSON.stringify({ ticket: 4118, level: "NotALevel" });

  /** The last step that actually committed something. A turn ends with a
   *  text-only step, which submits zero actions and therefore lands an EMPTY
   *  record — so `records().at(-1)` reads that empty tail, not the tool step.
   *  (My first draft of these assertions did exactly that and read `undefined`.) */
  function lastCommitted(h: ReturnType<typeof harness>) {
    return h.app.bus
      .records()
      .filter((r) => r.results.length > 0)
      .at(-1)
      ?.results.at(-1);
  }

  it("runs the root's strategy and the REPAIRED input is what commits", async () => {
    const h = harness();
    let repaired = 0;

    await declareAgent({
      model: modelCalling(MALFORMED),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      maxSteps: 2,
      repairToolCall: async ({ toolCall }) => {
        repaired += 1;
        return { ...toolCall, input: JSON.stringify({ ticket: "4118", level: "High" }) };
      },
    }).run({ prompt: "go" });

    // The hook ran …
    expect(repaired).toBe(1);
    // … and the repaired input, not the malformed one, is the committed truth.
    expect(lastCommitted(h)).toMatchObject({
      outcome: "ok",
      ticket: "4118",
      level: "High",
    });
  });

  it("an UNREPAIRABLE call still commits `unhandled` — the law repair must not swallow", async () => {
    const h = harness();
    let attempted = 0;

    await declareAgent({
      model: modelCalling(MALFORMED),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      maxSteps: 2,
      // Returning null means "I cannot fix this" — the runtime gives up and the
      // action travels the one existing path to a COMMITTED refusal.
      repairToolCall: async () => {
        attempted += 1;
        return null;
      },
      // AWAITED, NOT SUPPRESSED. The `.catch(() => undefined)` that used to sit
      // here converted EVERY rejection into success: `run()` could commit
      // `unhandled` and then reject for an unrelated reason — a later provider
      // call, a result-construction failure — and both assertions below would
      // still pass. Measured: the unrepairable path resolves normally, so there
      // was never anything to suppress.
      //
      // Recorded because the first fix MISSED THIS CALL SITE: the previous round
      // removed the identical catch from the repair case above, reported it as
      // done, and left this one. The ledger said removed; the tree said
      // otherwise. That is a claim outrunning its diff, which this campaign's
      // own honesty law forbids — caught by review, not by me.
    }).run({ prompt: "go" });

    expect(attempted).toBe(1);
    expect(lastCommitted(h)).toMatchObject({ outcome: "unhandled" });
  });
});
