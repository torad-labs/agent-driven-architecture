// ── blocks/triage/slice — the block's own state, copy-on-write ─────────────
// PURE. No I/O, no clock, no Actor. Every transition returns a NEW slice; a
// transition that cannot be applied returns nothing, so the ARM has to decide
// what to fold instead (12.4 rule 1).

import type { TicketId } from "@adr/spine/pure/ids";
import type { Priority } from "./contract";

export interface Ticket {
  readonly id: TicketId;
  readonly body: string;
}

export interface TriageSlice {
  readonly tickets: ReadonlyMap<TicketId, Ticket>;
  readonly priority: ReadonlyMap<TicketId, Priority>;
}

export const emptyTriageSlice: TriageSlice = { tickets: new Map(), priority: new Map() };

export function triageSliceOf(tickets: readonly Ticket[], level: Priority = "Normal"): TriageSlice {
  return {
    tickets: new Map(tickets.map((t) => [t.id, t])),
    priority: new Map(tickets.map((t) => [t.id, level])),
  };
}

export function ticketOf(slice: TriageSlice, ticket: TicketId): Ticket | null {
  return slice.tickets.get(ticket) ?? null;
}

export function priorityOf(slice: TriageSlice, ticket: TicketId): Priority | null {
  return slice.priority.get(ticket) ?? null;
}

export function withPriority(slice: TriageSlice, ticket: TicketId, level: Priority): TriageSlice {
  const priority = new Map(slice.priority);
  priority.set(ticket, level);
  return { ...slice, priority };
}
