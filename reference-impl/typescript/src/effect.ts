// ── Effect descriptors (seam 01) ────────────────────────────────────────────
// Plain data. The fold RETURNS these; only the boundary PERFORMS them.

import type { Priority } from "./domain";

export type Effect =
  | { readonly kind: "Log"; readonly what: string; readonly ticket: string; readonly level: Priority; readonly at: number }
  | { readonly kind: "PageOncall"; readonly ticket: string; readonly at: number }
  | { readonly kind: "Diag"; readonly note: string };
