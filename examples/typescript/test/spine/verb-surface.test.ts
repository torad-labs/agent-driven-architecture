// ── SDK-1 / VERB-SURFACE — the leverage point, and what it actually was ──────
// `VerbSpec` had slots for six things: name, describe, schema, run, sign, kind.
// The adapter that turns verbs into the runtime's tools is a generic loop that
// knows nothing about any specific tool, so it could only ever emit what the
// Verb type could HOLD. A block therefore could not declare model-facing
// behaviour the runtime supports — not because the spine forbade it, but because
// there was nowhere to put it.
//
// That is why this was the campaign's leverage point rather than one item among
// many: `toModelOutput`, `inputExamples`, `strict` and per-tool policy were all
// unreachable BY CONSTRUCTION, and every one of them reads in review as "they
// did not use the SDK properly" when the truth is "the IR could not express it".
//
// THE TEST THAT MATTERS IS THE LAST ONE. Widening a type is trivial; the claim
// worth proving is that a BLOCK can now declare this from inside its own folder
// with no further spine edit — which is G11's whole promise applied to the
// model-facing half.

import { object, string } from "valibot";
import { describe, expect, it } from "vitest";
import { buildTools } from "../../src/spine/agent/loop";
import { reversible } from "../../src/spine/pure/verb";
import { harness } from "../harness";

describe("SDK-1 — a Verb can carry the model-facing surface", () => {
  it("passes a block's inputExamples through to the tool definition", () => {
    const h = harness();
    const tools = buildTools(h.app.registry, h.app.boundary, h.app.dispatchers);

    // Declared in src/blocks/triage/tools.ts — inside the block's own folder.
    const examples = tools.setPriority?.inputExamples;
    expect(examples).toBeDefined();
    expect(examples?.length).toBe(2);
    expect(examples?.[0]?.input).toMatchObject({ ticket: "4118", level: "Urgent" });
  });

  it("passes a block's toModelOutput through, shaping what the MODEL sees", async () => {
    const h = harness();
    const tools = buildTools(h.app.registry, h.app.boundary, h.app.dispatchers);

    const shaped = await tools.setPriority?.toModelOutput?.({
      toolCallId: "t1",
      input: { ticket: "4118", level: "High" },
      output: { outcome: "ok", tool: "setPriority", ticket: "4118", level: "High", reason: null },
    });

    expect(shaped).toEqual({ type: "text", value: "4118 → High" });
  });

  it("leaves the runtime's own default in place for a verb that declared nothing", () => {
    const h = harness();
    const tools = buildTools(h.app.registry, h.app.boundary, h.app.dispatchers);

    // `undefined` in must mean `undefined` out. Handing the runtime an empty
    // override instead of no override would silently replace JSON serialisation
    // with an empty string for every verb that never opted in.
    expect(tools.requestEscalation?.toModelOutput).toBeUndefined();
    expect(tools.requestEscalation?.inputExamples).toBeUndefined();
  });

  it("a NEW verb declares the surface with ZERO spine edits — G11 for the model half", () => {
    const h = harness();

    // Authored here, in the shape a block author would write, touching nothing
    // in `spine/`. If this compiles and the adapter honours it, the leverage
    // point is closed.
    const invented = reversible<
      unknown,
      { note: string },
      { outcome: "ok"; tool: "setPriority"; ticket: string; level: "Low"; reason: null },
      never
    >({
      name: "setPriority",
      describe: "invented for this test",
      // A real Valibot schema, because that is what a block author writes and
      // because the adapter genuinely converts it — a hand-rolled Standard
      // Schema stub compiles but cannot be converted, which is the adapter
      // doing its job rather than a gap.
      schema: object({ note: string() }),
      run: () => ({
        outcome: "ok",
        tool: "setPriority",
        ticket: "x",
        level: "Low",
        reason: null,
      }),
      sign: () => {
        throw new Error("not signed in this test");
      },
      examples: [{ note: "an example the block chose" }],
      strict: true,
      toModelOutput: (result) => `shaped:${result.ticket}`,
    });

    expect(invented.examples).toEqual([{ note: "an example the block chose" }]);
    expect(invented.strict).toBe(true);

    const tools = buildTools(
      new Map([["setPriority", invented]]),
      h.app.boundary,
      h.app.dispatchers,
    );
    expect(tools.setPriority?.strict).toBe(true);
    expect(tools.setPriority?.inputExamples?.[0]?.input).toEqual({
      note: "an example the block chose",
    });
  });
});
