// ── The two kinds of tool (seam 03) ─────────────────────────────────────────
// A tool is pure: run(input, ctx) -> ToolResult. It reads the read-only context,
// returns a payload, and mutates nothing. UI tools and domain tools have the
// identical shape — everything is a tool, even the UI.

import type { Actor, State } from "./domain";
import type { ToolResult } from "./tool-result";
import type { Priority } from "./domain";

// The agent context: read-only ambient input the boundary stages before a step.
export interface Ctx {
  readonly state: State; // a read-only snapshot — the tool never writes it
  readonly actor: Actor; // who is acting (stamped by the boundary)
}

export interface Tool<I> {
  readonly name: string;
  run(input: I, ctx: Ctx): ToolResult;
}

// Domain tools — advance business logic.
export const setPriority: Tool<{ ticket: string; level: Priority }> = {
  name: "setPriority",
  run: (input) => ({ kind: "PrioritySet", ticket: input.ticket, level: input.level }),
};

export const requestEscalation: Tool<{ ticket: string }> = {
  name: "requestEscalation",
  run: (input, ctx) => ({ kind: "EscalationRequested", ticket: input.ticket, by: ctx.actor }),
};

export const confirmEscalation: Tool<{ ticket: string }> = {
  name: "confirmEscalation",
  run: (input, ctx) => ({ kind: "EscalationConfirmed", ticket: input.ticket, by: ctx.actor }),
};

// A UI tool — drives the surface. Same pure shape as a domain tool.
export const focusTicket: Tool<{ ticket: string }> = {
  name: "focusTicket",
  run: (input, ctx) => ({ kind: "Focused", ticket: input.ticket, known: ctx.state.tickets.has(input.ticket) }),
};
