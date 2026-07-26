// ── C13 — registry totality, and the AI SDK binding that still works ───────
// Every "ok" ToolResult case has a Verb entry and a `sign` branch, and the
// runtime binding drives the whole thing offline.

import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { fold } from "../../src/app/assemble";
import type { OkResult } from "../../src/app/contract";
import { initialState } from "../../src/app/contract";
import { runTurn } from "../../src/spine/agent/loop";
import { signResult } from "../../src/spine/boundary/action";
import type { Signature } from "../../src/spine/pure/actor";
import { authority } from "../../src/spine/pure/actor";
import type { Timestamp } from "../../src/spine/pure/ids";
import { refused } from "../../src/spine/pure/tool-result";
import { AGENT_RUN, harness } from "../harness";
import { must } from "../support/must";

// A compile-time half: this table must name every "ok" tool in the system, and
// the compiler fails the build if the union grows past it (mapped type over the
// union's own discriminant).
const EXPECTED: Record<OkResult["tool"], true> = {
  setPriority: true,
  requestEscalation: true,
  confirmEscalation: true,
  focusTicket: true,
  setPanel: true,
  recordFinding: true,
  requestSeal: true,
  confirmSeal: true,
  recallAnalysis: true,
  publishAnalysis: true,
  noteDrop: true,
  noteFault: true,
};

const sig: Signature = { by: "Agent", authority: authority("agent-run-7f") };

describe("registry totality (C13)", () => {
  it("every declared verb is registered, and every registered verb signs", () => {
    const { app } = harness();
    expect([...app.registry.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());

    for (const verb of app.registry.values()) {
      expect(verb.kind === "Reversible" || verb.kind === "Irreversible").toBe(true);
      expect(typeof verb.describe).toBe("string");
      expect(verb.describe.length).toBeGreaterThan(0);
    }
  });

  it("the spine's own two cases sign too — a refusal is a decision (5.4)", () => {
    const { app } = harness();
    expect(signResult(app.registry, refused("confirmSeal", "nope"), sig, "c9")).toEqual({
      outcome: "refused",
      tool: "confirmSeal",
      sig,
      id: "c9",
      reason: "nope",
    });
  });
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("the runtime binding — the boundary is hooked onto onStepFinish", () => {
  it("runs a real generateText loop offline and folds what the AGENT asked for", async () => {
    const h = harness();
    let call = 0;
    const model = new MockLanguageModelV3({
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
            usage,
            warnings: [],
          };
        }
        return {
          content: [{ type: "text" as const, text: "Priority set to High." }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        };
      },
    });

    const out = await runTurn({
      model,
      prompt: "ticket 4118 looks urgent",
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    expect(out.steps).toBe(2);
    expect(h.app.boundary.state.triage.priority.get("4118")).toBe("High");
    // the loop forwarded an ACTION; the boundary produced the recorded result
    expect(must(h.app.bus.records()[0]).actions).toEqual([
      { tool: "setPriority", input: { ticket: "4118", level: "High" } },
    ]);
    expect(must(h.app.bus.records()[0]).commands[0]).toMatchObject({
      tool: "setPriority",
      sig: { by: "Agent" },
    });
    expect(h.sink.performed.map((k) => k.effect.kind)).toEqual(["LogDecision"]);
  });
});

// ── The floor under block dispatch (§6.5) ──────────────────────────────────
// `foldOk`'s ownership chain is type predicates, and TypeScript TRUSTS a
// predicate it cannot verify. A block whose `owns` goes stale therefore narrows
// the result to `never` at compile time while a real value flows through at
// runtime — tsc exit 0, eslint exit 0, every test green, and then the fold
// returned `undefined` and the caller died on `out.effects is not iterable`.
//
// A crash out of the one arm 6.5 says must never crash. This pins the fix: the
// unclaimed result folds like any unknown tool name — no transition, one
// diagnostic, one notice naming the tool. Total AND observable.
describe("an unclaimed result folds observably instead of crashing (§6.5)", () => {
  it("emits a diagnostic and a notice rather than returning undefined", () => {
    const state = initialState({ tickets: [{ id: "4118", body: "refund not received" }] });
    const sig: Signature = { by: "Agent", authority: AGENT_RUN };
    const stale = { outcome: "ok", tool: "resolveTicket", ticket: "4118" } as never;

    const out = fold(state, [stale], 1 as Timestamp, sig);

    expect(out.effects).toHaveLength(1);
    expect(out.effects[0]).toMatchObject({ kind: "Diag" });
    const notices = out.state.spine.notices;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "Rejected", tool: "resolveTicket" });
    // no block slice advanced
    expect(out.state.triage).toEqual(state.triage);
  });
});
