// ── SDK-8 / PROVIDER — a real model is expressible, keylessly ────────────────
// The audit opened this item as "ZERO @ai-sdk/* provider packages installed —
// the repo has no provider at all". That framing was too strong, and the
// correction is the point of this file: at the pinned version
// `LanguageModel = GlobalProviderModelId | LanguageModelV3 | LanguageModelV2`,
// and the Vercel AI Gateway is the DEFAULT provider. A plain model string is a
// real model, with no provider dependency and no per-provider coupling anywhere
// in the book's examples.
//
// So the defect was never a missing package. It was that the port demonstrated
// NEITHER route: the one production call site drove a hand-written scripted
// model, and nothing anywhere showed how a reader would reach a real one.
//
// THE OFFLINE DEFAULT STAYS THE DEFAULT, deliberately. A reference implementation
// that needs an API key to run teaches nothing on first clone, and
// `examples/typescript/README.md` promises "Runnable, offline, no API keys."
// This test therefore proves EXPRESSIBILITY, not connectivity — it constructs the
// declaration and never runs it, so the suite stays hermetic.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { declareAgent } from "../../src/spine/agent/loop";
import { harness } from "../harness";

describe("SDK-8 — the declaration takes a real model without a provider package", () => {
  it("accepts a plain gateway model string", () => {
    const h = harness();

    // No @ai-sdk/* import anywhere in this file, and none in the tree. The
    // gateway is the default provider, so this string IS the provider binding.
    const declared = declareAgent({
      model: "anthropic/claude-sonnet-4.5",
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    // Constructed, not called: no network, no key, no flake.
    expect(Object.keys(declared.tools).length).toBe(h.app.registry.size);
  });

  it("accepts the offline mock on the SAME seam — one shape, two bindings", () => {
    const h = harness();

    const declared = declareAgent({
      model: new MockLanguageModelV3({}),
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    // The composition root swaps the binding and nothing else moves, which is
    // what G7 buys: real and faked differ in exactly one line.
    expect(Object.keys(declared.tools).length).toBe(h.app.registry.size);
  });
});
