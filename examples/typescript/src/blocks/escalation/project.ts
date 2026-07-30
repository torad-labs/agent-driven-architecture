// ── blocks/escalation/project — CONSUMERS 2 and 3 of TicketStatus (G12) ────
// This is the file the shipped reference failed 15.4's own G12 self-check in:
//
//     canEscalate: t.status.kind === "Open",
//     escalating:  t.status.kind === "Escalating",
//
// Adding `Archived` to the status union left that compiling clean, exit 0, 8/8
// green — so the "the compiler hands you the edit list" promise was false at the
// one place a reader would check it. An `===` against a single variant is NOT a
// closed match.
//
// Below, both projections are `never`-guarded switches over every variant. Add
// a variant and the build breaks HERE, twice, plus once in `fold.ts` — three
// sites, all inside this block folder, zero outside it. Prove it yourself:
//   add `| Archived` to TicketStatus, run `npm run typecheck`, expect 3 errors.

import { bounded, MAX_CONTEXT_LINES_PER_BLOCK } from "@adr/spine/pure/context";
import type { EscalationSlice, TicketStatus } from "./slice";

export interface EscalationRow {
  readonly ticket: string;
  readonly status: string;
  readonly canEscalate: boolean;
  readonly escalating: boolean;
  readonly escalated: boolean;
}

export interface EscalationView {
  readonly rows: readonly EscalationRow[];
}

export function escalationView(slice: EscalationSlice): EscalationView {
  return { rows: [...slice.statuses.values()].map(rowFor) };
}

// CONSUMER 2 — the view row.
function rowFor(status: TicketStatus): EscalationRow {
  switch (status.kind) {
    case "Open":
      return {
        ticket: status.ticket,
        status: "open",
        canEscalate: true,
        escalating: false,
        escalated: false,
      };
    case "Escalating":
      return {
        ticket: status.ticket,
        status: "escalating",
        canEscalate: false,
        escalating: true,
        escalated: false,
      };
    case "Escalated":
      return {
        ticket: status.ticket,
        status: "escalated",
        canEscalate: false,
        escalating: false,
        escalated: true,
      };
    case "Resolved":
      return {
        ticket: status.ticket,
        status: "resolved",
        canEscalate: false,
        escalating: false,
        escalated: false,
      };
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

export function escalationContextLines(slice: EscalationSlice): readonly string[] {
  const lines = [...slice.statuses.values()].map(contextLineFor);
  return bounded(lines, MAX_CONTEXT_LINES_PER_BLOCK);
}

// CONSUMER 3 — the reasoner's digest. A pure projection of the same slice, held
// to the same closed-match rule, so what the model reads and what the user sees
// can never drift apart silently.
function contextLineFor(status: TicketStatus): string {
  switch (status.kind) {
    case "Open":
      return `ticket ${status.ticket}: open, may be escalated`;
    case "Escalating":
      return `ticket ${status.ticket}: escalation requested, awaiting a different authority`;
    case "Escalated":
      return `ticket ${status.ticket}: escalated, on-call paged`;
    case "Resolved":
      return `ticket ${status.ticket}: resolved`;
    default: {
      const _never: never = status;
      return _never;
    }
  }
}
