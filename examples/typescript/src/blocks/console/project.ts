// ── blocks/console/project — the two pure projections ──────────────────────
// The ONLY importer of `view-state` (check C12). Ephemeral state joins the
// ViewModel here, at the very edge, and never travels the other way.

import { MAX_CONTEXT_LINES_PER_BLOCK, bounded } from "../../spine/pure/context";
import type { ConsoleSlice } from "./slice";
import type { ConsoleViewState } from "./view-state";
import { initialViewState } from "./view-state";

export interface PanelRow {
  readonly panel: string;
  readonly visible: boolean;
}

export interface ConsoleView {
  readonly focused: string | null;
  readonly panels: readonly PanelRow[];
  /** ephemeral, never folded — decorates the view and dies with the tab */
  readonly hoveredTicket: string | null;
}

export function consoleView(slice: ConsoleSlice, ephemeral: ConsoleViewState = initialViewState): ConsoleView {
  return {
    focused: slice.focused,
    panels: [...slice.panels.entries()].map(([panel, visible]) => ({ panel, visible })),
    hoveredTicket: ephemeral.hoveredTicket,
  };
}

/** Ephemeral state is deliberately ABSENT from the reasoner's digest: the model
 *  reads decisions, not a scroll offset. */
export function consoleContextLines(slice: ConsoleSlice): readonly string[] {
  const focus = slice.focused === null ? "console: no ticket focused" : `console: focused on ${slice.focused}`;
  const panels = [...slice.panels.entries()].map(([panel, visible]) => `panel ${panel}: ${visible ? "shown" : "hidden"}`);
  return bounded([focus, ...panels], MAX_CONTEXT_LINES_PER_BLOCK);
}
