// ── SDK-6 / APPROVAL-SEAM — WITHDRAWN, and this file is why ─────────────────
// Three passes got the API wrong before review got the DESIGN wrong.
//
//   1. The audit recommended `needsApproval` from type inspection.
//   2. A later pass read the published docs ("use needsApproval only with
//      WorkflowAgent; use toolApproval") and retracted it — applying v7 docs to
//      a v6 tree, where `toolApproval` does not exist as a setting at all.
//   3. So `needsApproval` went in, on the same "make it expressible" reasoning
//      that justified `toModelOutput` and `repairToolCall`.
//
// THAT REASONING WAS WRONG, and shipping it proved it. Those two are PURE
// PASSTHROUGHS. Approval is a STATE MACHINE — request, decide, resume — and this
// port had no resume path. With none, declaring it did not add caution; it
// FABRICATED HISTORY. The runtime withheld the call; `resolveAction` re-ran the
// pure body at the boundary anyway, because C7 cannot see that the runtime
// declined; and the timeline committed `outcome: ok` for an action nobody
// authorised and nothing executed. Measured on the shipped code:
// recordsBefore=0 -> recordsAfter=1, verb body counter still 0.
//
// So the seam is withdrawn, and two things are pinned below: that a withheld
// call can never commit, and that the gate — the approval this port actually
// specifies — is untouched.

import { MockLanguageModelV3 } from "ai/test";
import { object, string } from "valibot";
import { describe, expect, it } from "vitest";
import { buildTools } from "../../src/spine/agent/loop";
import type { FinishedStep } from "../../src/spine/boundary/action";
import {
  admittedCalls,
  registryOf,
  resolveAction,
  submitFinishedStep,
} from "../../src/spine/boundary/action";
import { reversible } from "../../src/spine/pure/verb";
import { harness } from "../harness";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("SDK-6 — a withheld call can never commit", () => {
  it("drops a call the runtime withheld for approval", () => {
    const calls = [
      { toolCallId: "a", toolName: "setPriority", input: { ticket: "1" } },
      { toolCallId: "b", toolName: "requestEscalation", input: { ticket: "2" } },
    ];
    const content = [
      { type: "text", text: "..." },
      { type: "tool-approval-request", approvalId: "ap-1", toolCall: { toolCallId: "b" } },
    ];

    // `b` was withheld, so only `a` may reach the boundary.
    expect(admittedCalls(calls, content)).toEqual([
      { tool: "setPriority", input: { ticket: "1" } },
    ]);
  });

  it("does NOT drop a call whose execute merely threw", () => {
    // The distinction the filter has to make. A failed `execute` is the
    // RUNTIME's copy failing; the recorded truth comes from the pure re-run at
    // the boundary, so the action must still travel the one path. Filtering on
    // `toolResults` instead would have traded a silent commit for a silent
    // omission.
    const calls = [{ toolCallId: "a", toolName: "setPriority", input: { ticket: "1" } }];
    const content = [{ type: "tool-error", toolCallId: "a", error: "boom" }];

    expect(admittedCalls(calls, content)).toEqual([
      { tool: "setPriority", input: { ticket: "1" } },
    ]);
  });

  it("admits everything when the runtime withheld nothing", () => {
    const calls = [{ toolCallId: "a", toolName: "setPriority", input: { ticket: "1" } }];
    expect(admittedCalls(calls, [{ type: "text", text: "hi" }]).length).toBe(1);
  });

  it("drops a PROVIDER-EXECUTED call — it is not this boundary's to record", () => {
    // Review finding. `toolCalls` also carries calls the PROVIDER ran, whose
    // local `execute` is skipped. Submitting one made the boundary resolve a
    // name its registry never had and commit `Unhandled("no registered verb")`
    // — a record claiming the local system saw and refused something that was
    // never its business. Measured before the fix, verbatim:
    //   {"outcome":"unhandled","tool":"providerSearch","note":"no registered verb"}
    const calls = [
      { toolCallId: "p1", toolName: "providerSearch", input: { q: "x" }, providerExecuted: true },
      { toolCallId: "a", toolName: "setPriority", input: { ticket: "1" } },
    ];

    expect(admittedCalls(calls, [])).toEqual([{ tool: "setPriority", input: { ticket: "1" } }]);
  });
});

describe("SDK-6 — the WIRING is pinned, not just the predicate", () => {
  // Review finding. With only `admittedCalls` under test, reverting
  // `onStepFinish` to a direct `toolCalls.map(...)` left every case green while
  // a withheld call could commit again. The adapter the seam actually calls is
  // now exercised through a recording channel, so that bypass is a deterministic
  // failure rather than an ambient hazard.
  function recordingChannel(seen: FinishedStep[]) {
    return {
      submit: (step: FinishedStep) => {
        seen.push(step);
        return 0;
      },
    };
  }

  it("a PROVIDER-EXECUTED call leaves the bus unchanged THROUGH A REAL TURN", async () => {
    // THE ONE THAT PINS THE SEAM. Exercising `submitFinishedStep` directly (the
    // case below) proves the adapter filters — it does NOT prove `onStepFinish`
    // calls it. Measured: with only that case, reverting the seam to a direct
    // `toolCalls.map(...)` left this file 10/10 GREEN while the bypass was live.
    //
    // This drives a provider-owned call through a real turn, so the revert is a
    // deterministic failure: the direct map would submit it and the boundary
    // would commit `Unhandled("no registered verb")`.
    const h = harness();
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "p1",
            toolName: "providerSearch",
            input: JSON.stringify({ q: "x" }),
            providerExecuted: true,
          },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      }),
    });

    const { declareAgent } = await import("../../src/spine/agent/loop");
    await declareAgent({
      model,
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      maxSteps: 1,
    }).run({ prompt: "go" });

    // Not one committed result — the local boundary never owned this action.
    expect(h.app.bus.records().flatMap((r) => r.results)).toEqual([]);
  });

  it("submits only admitted calls through the real adapter", () => {
    const seen: FinishedStep[] = [];
    submitFinishedStep(
      recordingChannel(seen),
      [],
      [
        { toolCallId: "a", toolName: "setPriority", input: { ticket: "1" } },
        { toolCallId: "b", toolName: "requestEscalation", input: { ticket: "2" } },
        { toolCallId: "p", toolName: "providerSearch", input: {}, providerExecuted: true },
      ],
      [{ type: "tool-approval-request", approvalId: "ap-1", toolCall: { toolCallId: "b" } }],
    );

    expect(seen.length).toBe(1);
    expect(seen[0]?.actions).toEqual([{ tool: "setPriority", input: { ticket: "1" } }]);
  });
});

describe("SDK-6 — no verb can declare approval, and the gate is untouched", () => {
  it("exposes no approval field on any shipped tool", () => {
    const h = harness();
    const tools = buildTools(h.app.registry, h.app.boundary, h.app.dispatchers);

    // The seam is withdrawn, not merely unused: nothing in the tree can set it.
    for (const name of Object.keys(tools)) {
      expect(tools[name]?.needsApproval).toBeUndefined();
    }
  });

  it("still refuses a self-confirm pre-fold, with the refusal COMMITTED", async () => {
    const h = harness();

    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
    });
    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "confirmEscalation", input: { ticket: "4118" } }],
    });

    expect(h.app.bus.records().at(-1)?.results.at(-1)).toMatchObject({ outcome: "refused" });
  });

  it("an ordinary turn still commits what the model asked for", async () => {
    const h = harness();
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "t1",
            toolName: "setPriority",
            input: JSON.stringify({ ticket: "4118", level: "High" }),
          },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      }),
    });

    // The filter must not have broken the normal path.
    const { declareAgent } = await import("../../src/spine/agent/loop");
    await declareAgent({
      model,
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
      maxSteps: 1,
    }).run({ prompt: "go" });

    expect(h.app.bus.records().at(-1)?.results.at(-1)).toMatchObject({ outcome: "ok" });
  });
});

describe("resolveAction is TOTAL — a throwing verb body cannot vanish", () => {
  // Review finding, reproduced before fixing: `resolveAction` THREW. The
  // exception left the single production site, passed through `Boundary.submit`
  // into the loop's `onStepFinish`, and the runtime's callback notification
  // swallowed it — so the turn resolved with the record NEVER APPENDED. No ok,
  // no refusal, no Unhandled: the action simply was not on the timeline, which
  // is the one outcome this architecture does not permit.
  //
  // Measured directly at the seam before the fix:
  //   resolveAction THREW: Error: verb body exploded

  it("commits exactly one `unhandled` instead of throwing", () => {
    const boom = reversible<
      unknown,
      { ticket: string },
      { outcome: "ok"; tool: "setPriority" },
      never
    >({
      name: "setPriority",
      describe: "throws",
      schema: object({ ticket: string() }),
      run: () => {
        throw new Error("verb body exploded");
      },
      sign: () => {
        throw new Error("not signed in this test");
      },
    });

    const result = resolveAction(
      registryOf([boom]),
      { tool: "setPriority", input: { ticket: "4118" } },
      { state: {}, context: { staged: [], lines: [], notices: [], artifactLineCount: 0 } },
    );

    expect(result).toMatchObject({ outcome: "unhandled", tool: "setPriority" });
  });

  it("still returns the verb's own result when the body does NOT throw", () => {
    const fine = reversible<
      unknown,
      { ticket: string },
      { outcome: "ok"; tool: "setPriority" },
      never
    >({
      name: "setPriority",
      describe: "ok",
      schema: object({ ticket: string() }),
      run: () => ({ outcome: "ok", tool: "setPriority" }),
      sign: () => {
        throw new Error("not signed in this test");
      },
    });

    const result = resolveAction(
      registryOf([fine]),
      { tool: "setPriority", input: { ticket: "4118" } },
      { state: {}, context: { staged: [], lines: [], notices: [], artifactLineCount: 0 } },
    );

    // The catch must not swallow success into a blanket Unhandled.
    expect(result).toMatchObject({ outcome: "ok", tool: "setPriority" });
  });
});
