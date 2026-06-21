// ── Tool results (seam 03) ──────────────────────────────────────────────────
// The payload a tool returns. Plain data — never an entity, a live handle, or
// the clock. This is what crosses back to the boundary and gets folded.

import type { Actor, Priority } from "./domain";

export type ToolResult =
  | { readonly kind: "PrioritySet"; readonly ticket: string; readonly level: Priority }
  | { readonly kind: "EscalationRequested"; readonly ticket: string; readonly by: Actor }
  | { readonly kind: "EscalationConfirmed"; readonly ticket: string; readonly by: Actor }
  | { readonly kind: "Focused"; readonly ticket: string; readonly known: boolean };
