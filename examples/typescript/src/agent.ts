// ── The loop is a declaration (seam 06/07, the runtime binding) ─────────────
// This is the ONLY file that touches the agent-loop runtime (the Vercel AI SDK).
// It wraps the pure tools as SDK tools and hooks the boundary onto the SDK's
// `onStepFinish` — that callback IS the boundary seam. No domain logic lives here.

import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { Boundary } from "./boundary";
import type { Ctx } from "./tools";
import { focusTicket, requestEscalation, setPriority } from "./tools";
import type { ToolResult } from "./tool-result";

const priority = z.enum(["Low", "Normal", "High", "Urgent"]);

// Wrap each pure tool as an SDK tool. execute() runs the pure tool against a
// read-only ctx built from the boundary's current state and returns the payload.
// NOTE: confirmEscalation is deliberately NOT exposed to the agent — the
// irreversible confirm is a host/out-of-band action. The gate also holds in the
// fold, so even a forged agent confirm would be denied.
export function buildTools(boundary: Boundary) {
  const ctx = (): Ctx => ({ state: boundary.state, actor: "Agent" });
  return {
    setPriority: tool({
      description: "Set a support ticket's priority (Low | Normal | High | Urgent).",
      inputSchema: z.object({ ticket: z.string(), level: priority }),
      execute: async (input): Promise<ToolResult> => setPriority.run(input, ctx()),
    }),
    requestEscalation: tool({
      description: "Request escalation of a ticket. Reversible; does NOT page on-call.",
      inputSchema: z.object({ ticket: z.string() }),
      execute: async (input): Promise<ToolResult> => requestEscalation.run(input, ctx()),
    }),
    focusTicket: tool({
      description: "Bring a ticket into focus on the console.",
      inputSchema: z.object({ ticket: z.string() }),
      execute: async (input): Promise<ToolResult> => focusTicket.run(input, ctx()),
    }),
  };
}

export interface RunTurn {
  readonly model: LanguageModel;
  readonly prompt: string;
  readonly boundary: Boundary;
}

// Run one agent turn-chain. The runtime drives the loop; the boundary folds each
// step's tool results. `actor` is "Agent" because this is the agent acting.
export async function runTurn(opts: RunTurn): Promise<{ steps: number; text: string }> {
  const tools = buildTools(opts.boundary);
  const result = await generateText({
    model: opts.model,
    tools,
    stopWhen: stepCountIs(8),
    prompt: opts.prompt,
    onStepFinish: ({ toolResults }) => {
      const results = toolResults.map((tr) => tr.output as ToolResult);
      if (results.length > 0) {
        opts.boundary.onStepFinish({ actor: "Agent", results });
      }
    },
  });
  return { steps: result.steps.length, text: result.text };
}
