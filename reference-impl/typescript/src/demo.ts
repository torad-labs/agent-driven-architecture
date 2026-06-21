// ── A runnable, offline end-to-end demo (`npm run demo`) ────────────────────
// No API keys, no network: a scripted model drives the real agent loop, the
// boundary folds each step, and the gate is shown holding both ways.

import { MockLanguageModelV3 } from "ai/test";
import { initialState } from "./domain";
import { Boundary, RecordingBus, sequentialIds, type Clock, type Sink } from "./boundary";
import { runTurn } from "./agent";
import { project } from "./projection";
import type { Effect } from "./effect";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

// a deterministic, monotonically increasing clock for stable demo output
function tickingClock(): Clock {
  let t = 1000;
  return { now: () => (t += 1) };
}

async function main(): Promise<void> {
  // 1) An agent turn, scripted offline: the agent calls setPriority, then finishes.
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
        content: [{ type: "text", text: "Set #4118 to High." }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });

  const performed: Effect[] = [];
  const sink: Sink = { perform: (fx) => performed.push(fx) };
  const boundary = new Boundary(
    tickingClock(),
    sequentialIds("cmd"),
    new RecordingBus(),
    sink,
    initialState([{ id: "4118", body: "refund not received", priority: "Normal", status: { kind: "Open" } }]),
  );

  const turn = await runTurn({ model, prompt: "ticket 4118 looks urgent", boundary });
  console.log(`\n[agent] ran ${turn.steps} steps, said: "${turn.text}"`);
  console.log("[state] after the agent set priority:", project(boundary.state).rows[0]);

  // 2) The host requests escalation out-of-band (a person, carrying Actor.Human).
  boundary.onStepFinish({ actor: "Human", results: [{ kind: "EscalationRequested", ticket: "4118", by: "Human" }] });

  // 3) An AGENT tries to self-confirm — the gate DENIES it; no page fires.
  boundary.onStepFinish({ actor: "Agent", results: [{ kind: "EscalationConfirmed", ticket: "4118", by: "Agent" }] });
  console.log("\n[gate] agent self-confirm →", performed.at(-1));

  // 4) The HOST confirms (out-of-band) — the page finally fires.
  boundary.onStepFinish({ actor: "Human", results: [{ kind: "EscalationConfirmed", ticket: "4118", by: "Human" }] });
  console.log("[gate] host confirm    →", performed.at(-1));

  console.log("\n[effects performed]", performed.map((e) => e.kind).join(" · "));
  console.log("[final state]", project(boundary.state).rows[0], "\n");
}

void main();
