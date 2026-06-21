// ── The inner ring: entities (seam 01) ──────────────────────────────────────
// Pure domain types and pure state transitions. No I/O, no framework, no clock.
// State is a discriminated-union value; every transition returns a NEW State.

export type Actor = "Human" | "Agent";
export type Priority = "Low" | "Normal" | "High" | "Urgent";

export type TicketStatus =
  | { readonly kind: "Open" }
  | { readonly kind: "Escalating"; readonly by: Actor }
  | { readonly kind: "Escalated" }
  | { readonly kind: "Resolved" };

export interface Ticket {
  readonly id: string;
  readonly body: string;
  readonly priority: Priority;
  readonly status: TicketStatus;
}

export type RunStatus =
  | { readonly kind: "Idle" }
  | { readonly kind: "Working" }
  | { readonly kind: "Degraded"; readonly cause: string }
  | { readonly kind: "Error"; readonly fault: string };

export interface State {
  readonly tickets: ReadonlyMap<string, Ticket>;
  readonly focused: string | null;
  readonly run: RunStatus;
}

export function initialState(tickets: readonly Ticket[] = []): State {
  return {
    tickets: new Map(tickets.map((t) => [t.id, t])),
    focused: null,
    run: { kind: "Idle" },
  };
}

// ── Pure transitions — copy-on-write, never mutate the input ─────────────────

export function withPriority(s: State, ticket: string, level: Priority): State {
  const t = s.tickets.get(ticket);
  if (!t) return withUnhandled(s, `priority for unknown ticket ${ticket}`);
  const tickets = new Map(s.tickets);
  tickets.set(ticket, { ...t, priority: level });
  return { ...s, tickets };
}

export function withStatus(s: State, ticket: string, status: TicketStatus): State {
  const t = s.tickets.get(ticket);
  if (!t) return withUnhandled(s, `status for unknown ticket ${ticket}`);
  const tickets = new Map(s.tickets);
  tickets.set(ticket, { ...t, status });
  return { ...s, tickets };
}

export function withFocus(s: State, ticket: string): State {
  return { ...s, focused: ticket };
}

export function withUnhandled(s: State, note: string): State {
  return { ...s, run: { kind: "Degraded", cause: note } };
}
