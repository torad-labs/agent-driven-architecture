// ── SDK-7 / CANCELLATION — the cancel deadline must reach the model call ─────
// The consumer already models cancellation END TO END, and that is what made
// this a defect rather than a missing feature:
//
//   · `TurnContext.signal` (spine/concurrency/consumer) is a real AbortSignal,
//     minted per turn and handed to the TurnRunner.
//   · `cancelDeadlineMs` blows, and the consumer COMMITS a fault reading
//     "cancel deadline exceeded after Nms — turn abandoned, its channel revoked"
//     (app/wire, reportActions).
//
// …and `runTurn` had no parameter to accept the signal, so no TurnRunner could
// pass it through. The system therefore committed a signed, replayable record
// saying the turn was abandoned while the underlying request kept running and
// kept billing. The record was false in the same direction SDK-21's digest was:
// the timeline asserted something about the world that the world did not do.
//
// `generateText` has taken `abortSignal` (and `timeout`) since before the pinned
// version, so nothing here waits on the v6/v7 ruling.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { runTurn } from "../../src/spine/agent/loop";
import { harness } from "../harness";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Records whether the provider was handed a signal at all — the assertion that
 *  distinguishes "the loop accepted a signal" from "the signal reached the wire".
 *  Only the second one stops a request. */
function signalSpy(saw: { signal: AbortSignal | undefined }): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      saw.signal = options.abortSignal;
      return {
        content: [{ type: "text" as const, text: "done" }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

describe("SDK-7 — an abort reaches the model, not just the consumer's bookkeeping", () => {
  it("forwards the turn's AbortSignal to the provider call", async () => {
    const h = harness();
    const saw: { signal: AbortSignal | undefined } = { signal: undefined };
    const controller = new AbortController();

    await runTurn({
      model: signalSpy(saw),
      prompt: "ticket 4118 looks urgent",
      abortSignal: controller.signal,
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    // THE LOAD-BEARING LINE. Before this landed the provider saw `undefined`,
    // which is exactly why "turn abandoned" could be committed over a request
    // that was still in flight.
    expect(saw.signal).toBeDefined();
  });

  // WHAT THIS LAYER CAN HONESTLY ASSERT, AND WHAT IT CANNOT — both drafts of this
  // case were wrong, and the corrections are the useful part.
  //
  // Draft 1 aborted up front and expected `runTurn` to reject. It did not:
  // `MockLanguageModelV3` never consults `abortSignal`, so that was a test of the
  // MOCK. Passing it would have meant writing an abort check into the fake and
  // calling the result a guarantee.
  //
  // Draft 2 aborted during step 1 and expected step 2 not to run. MEASURED: the
  // loop ran all 8 steps. So `generateText` at the pinned version does NOT short-circuit
  // between steps on an aborted signal — it forwards the signal and relies on the
  // provider to honour it (a fetch-based provider does; a mock does not).
  //
  // So the guarantee this seam actually provides is exactly one thing: the
  // caller's own signal reaches the provider, live. That is what makes the
  // committed "turn abandoned" fault true against a real provider, and it is all
  // that is claimed here. Stated rather than quietly narrowed, because a test
  // named for a stronger property than it checks is how a green suite lies.
  it("forwards the caller's OWN signal, not a detached copy — abort is observable", async () => {
    const h = harness();
    const saw: { signal: AbortSignal | undefined } = { signal: undefined };
    const controller = new AbortController();

    await runTurn({
      model: signalSpy(saw),
      prompt: "ticket 4118 looks urgent",
      abortSignal: controller.signal,
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    expect(saw.signal?.aborted).toBe(false);
    controller.abort();
    // The provider held the caller's signal, so the consumer's deadline is
    // visible to an in-flight request rather than to a snapshot of one.
    expect(saw.signal?.aborted).toBe(true);
  });

  it("without a signal the turn still runs — cancellation is opt-in, not required", async () => {
    const h = harness();
    const saw: { signal: AbortSignal | undefined } = { signal: undefined };

    const out = await runTurn({
      model: signalSpy(saw),
      prompt: "ticket 4118 looks urgent",
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    expect(out.text).toBe("done");
  });
});
