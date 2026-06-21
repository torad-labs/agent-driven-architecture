// ── The view projection: the Presenter (seam 04) ────────────────────────────
// Pure. Pre-decides every presentational flag onto a separate ViewModel type.
// The surface applies these flags; it never computes them.

import type { Priority, State } from "./domain";

export interface TicketRow {
  readonly ticket: string;
  readonly badge: string; // pre-computed, e.g. "HIGH"
  readonly canEscalate: boolean; // decided HERE, not in the view
  readonly escalating: boolean;
  readonly focused: boolean;
}

export interface ConsoleView {
  readonly rows: readonly TicketRow[];
  readonly banner: string;
}

function badgeFor(p: Priority): string {
  return p.toUpperCase();
}

export function project(state: State): ConsoleView {
  const rows: TicketRow[] = [];
  for (const t of state.tickets.values()) {
    rows.push({
      ticket: t.id,
      badge: badgeFor(t.priority),
      canEscalate: t.status.kind === "Open",
      escalating: t.status.kind === "Escalating",
      focused: state.focused === t.id,
    });
  }
  const banner = state.run.kind === "Degraded" ? `degraded: ${state.run.cause}` : "ok";
  return { rows, banner };
}
