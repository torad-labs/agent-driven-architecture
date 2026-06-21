// ── The signed action (seam 02) ─────────────────────────────────────────────
// A human tap and an agent tool-call become the SAME Command, differing only by
// `by: Actor`. Everything — even a UI focus — is a command on one bus.

import type { Actor, Priority } from "./domain";

export type Command =
  | { readonly kind: "SetPriority"; readonly by: Actor; readonly id: string; readonly ticket: string; readonly level: Priority }
  | { readonly kind: "RequestEscalation"; readonly by: Actor; readonly id: string; readonly ticket: string }
  | { readonly kind: "ConfirmEscalation"; readonly by: Actor; readonly id: string; readonly ticket: string }
  | { readonly kind: "FocusTicket"; readonly by: Actor; readonly id: string; readonly ticket: string };
