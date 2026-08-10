// ── SDK-16 — the call settings, and why `seed` is not a rounding error ───────
// The loop set NONE of maxOutputTokens, temperature, topP, topK, presencePenalty,
// frequencyPenalty, stopSequences, seed, maxRetries or timeout. Most of that is
// ordinary omission. `seed` is not.
//
// This repository's entire argument is a replayable, deterministic command
// timeline: `refold` re-derives state and the context digest from committed
// bytes and compares, and the golden trace is the check. A port that stakes its
// case on determinism and leaves unset the one determinism knob the runtime
// offers was arguing against itself in its own flagship example.
//
// WHAT THE TEST CAN CLAIM. That the value REACHES the provider. Whether a given
// model actually returns identical tokens for identical seeds is the provider's
// to honour and is not assertable here — the same honest boundary SDK-7 drew for
// `abortSignal`. What changes is that the intent is expressible and reviewable
// rather than absent.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { declareAgent } from "../../src/spine/agent/loop";
import { harness } from "../harness";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function settingsSpy(seen: Record<string, unknown>[]): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      seen.push(options as unknown as Record<string, unknown>);
      return {
        content: [{ type: "text" as const, text: "done" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

describe("SDK-16 — call settings are root-owned and actually sent", () => {
  it("forwards `seed` — the knob this port's determinism thesis depends on", async () => {
    const h = harness();
    const seen: Record<string, unknown>[] = [];

    await declareAgent({
      model: settingsSpy(seen),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      seed: 73,
    }).run({ prompt: "go" });

    expect(seen[0]?.["seed"]).toBe(73);
  });

  it("forwards temperature and maxOutputTokens", async () => {
    const h = harness();
    const seen: Record<string, unknown>[] = [];

    await declareAgent({
      model: settingsSpy(seen),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      temperature: 0,
      maxOutputTokens: 256,
    }).run({ prompt: "go" });

    // `0` is a REAL value, not an absence — a settings path written with `||`
    // would silently drop it, which is the classic version of this bug.
    expect(seen[0]?.["temperature"]).toBe(0);
    expect(seen[0]?.["maxOutputTokens"]).toBe(256);
  });

  it("sends nothing when the root names nothing — the default path is unchanged", async () => {
    const h = harness();
    const seen: Record<string, unknown>[] = [];

    await declareAgent({
      model: settingsSpy(seen),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    }).run({ prompt: "go" });

    expect(seen[0]?.["seed"]).toBeUndefined();
    expect(seen[0]?.["temperature"]).toBeUndefined();
  });
});
