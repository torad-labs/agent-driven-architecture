// ── blocks/escalation/slice — a sealed status set, used FULLY (G12) ────────
// `TicketStatus` is the worked instance of G12's central instruction: declare
// shared properties on the sealed parent so every variant carries them BY
// CONSTRUCTION. Two properties earn their place there:
//
//   ticket         every status is about a ticket; no variant may forget it
//   requestedBy    the authority whose Request is still pending confirmation,
//                  or null. This is what the boundary gate compares against —
//                  and because it is declared on the PARENT, a fifth variant
//                  cannot be added without answering "is a request pending?".
//                  That answer costs the gate ZERO consumer sites: adding
//                  `Archived` breaks the fold arm, the view row and the context
//                  line, and nothing else in the system.
//
// The variant list is closed here and consumed with `never`-guarded switches in
// `fold.ts` and `project.ts` — the three sites 15.4's G12 self-check promises,
// all inside this one folder.

import type { Authority } from "../../spine/pure/actor";
import type { TicketId } from "../../spine/pure/ids";

export type TicketStatusKind = "Open" | "Escalating" | "Escalated" | "Resolved";

export interface TicketStatusBase {
  readonly kind: TicketStatusKind;
  readonly ticket: TicketId;
  /** the authority that ASKED, while the ask is still outstanding */
  readonly requestedBy: Authority | null;
}

export interface Open extends TicketStatusBase {
  readonly kind: "Open";
  readonly requestedBy: null;
}

export interface Escalating extends TicketStatusBase {
  readonly kind: "Escalating";
  readonly requestedBy: Authority;
}

export interface Escalated extends TicketStatusBase {
  readonly kind: "Escalated";
  readonly requestedBy: null;
  readonly confirmedBy: Authority;
}

export interface Resolved extends TicketStatusBase {
  readonly kind: "Resolved";
  readonly requestedBy: null;
}

export type TicketStatus = Open | Escalating | Escalated | Resolved;

export interface EscalationSlice {
  readonly statuses: ReadonlyMap<TicketId, TicketStatus>;
}

export const emptyEscalationSlice: EscalationSlice = { statuses: new Map() };

export function escalationSliceOf(tickets: readonly TicketId[]): EscalationSlice {
  return { statuses: new Map(tickets.map((t) => [t, open(t)])) };
}

export function open(ticket: TicketId): Open {
  return { kind: "Open", ticket, requestedBy: null };
}

export function escalating(ticket: TicketId, requestedBy: Authority): Escalating {
  return { kind: "Escalating", ticket, requestedBy };
}

export function escalated(ticket: TicketId, confirmedBy: Authority): Escalated {
  return { kind: "Escalated", ticket, requestedBy: null, confirmedBy };
}

/** `null` means "this stream has never heard of that ticket" — which is a fact
 *  the ARM has to handle, not a reason to invent an Open status. */
export function statusOf(slice: EscalationSlice, ticket: TicketId): TicketStatus | null {
  return slice.statuses.get(ticket) ?? null;
}

export function withStatus(slice: EscalationSlice, status: TicketStatus): EscalationSlice {
  const statuses = new Map(slice.statuses);
  statuses.set(status.ticket, status);
  return { statuses };
}
