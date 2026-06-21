import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { initialState } from "../src/domain";
import { Boundary, RecordingBus, fixedClock, sequentialIds, type Sink } from "../src/boundary";
import { runTurn } from "../src/agent";

// the verbose-but-required v6 usage block, factored out
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("the runtime binding — the boundary is hooked onto onStepFinish", () => {
  it("runs a real generateText loop offline: the agent calls setPriority, the boundary folds it", async () => {
    // Script the model with NO network: step 1 calls setPriority; step 2 finishes.
    let call = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        call += 1;
        if (call === 1) {
          return {
            content: [
              {
                type: "tool-call",
                toolCallId: "c1",
                toolName: "setPriority",
                input: JSON.stringify({ ticket: "4118", level: "High" }),
              },
            ],
            finishReason: { unified: "tool-calls", raw: undefined },
            usage,
            warnings: [],
          };
        }
        return {
          content: [{ type: "text", text: "Priority set to High." }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        };
      },
    });

    const bus = new RecordingBus();
    const performed: string[] = [];
    const sink: Sink = { perform: (fx) => performed.push(fx.kind) };
    const boundary = new Boundary(
      fixedClock(7),
      sequentialIds("c"),
      bus,
      sink,
      initialState([{ id: "4118", body: "refund not received", priority: "Normal", status: { kind: "Open" } }]),
    );

    const out = await runTurn({ model, prompt: "ticket 4118 looks urgent", boundary });

    // the real loop ran two steps (tool call, then finish)
    expect(out.steps).toBe(2);
    // the boundary folded the agent's tool result → domain state updated
    expect(boundary.state.tickets.get("4118")!.priority).toBe("High");
    // committed as a signed Agent command, then the Log effect performed
    expect(bus.commands.map((c) => `${c.kind}:${c.by}`)).toContain("SetPriority:Agent");
    expect(performed).toContain("Log");
  });
});
