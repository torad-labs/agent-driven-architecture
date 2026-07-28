// VIOLATION: G1 — a ToolResult variant may never carry an Actor.
import type { Actor } from "../../spine/pure/actor";
export interface SetPriorityResult {
  readonly tool: "setPriority";
  readonly by: Actor;
}
