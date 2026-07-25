// ── blocks/console/slice — presentation TRUTH, folded like any other ───────
// Which ticket is focused and which panels are shown are decisions someone
// made; losing them on a re-fold would change what the system believes about
// the session, so by 4.6's own test they belong in State.

import type { PanelId, TicketId } from "../../spine/pure/ids";

export interface ConsoleSlice {
  readonly focused: TicketId | null;
  readonly panels: ReadonlyMap<PanelId, boolean>;
}

export const emptyConsoleSlice: ConsoleSlice = { focused: null, panels: new Map() };

export function consoleSliceOf(panels: readonly PanelId[]): ConsoleSlice {
  return { focused: null, panels: new Map(panels.map((p) => [p, true])) };
}

export function knowsPanel(slice: ConsoleSlice, panel: PanelId): boolean {
  return slice.panels.has(panel);
}

export function withFocus(slice: ConsoleSlice, ticket: TicketId): ConsoleSlice {
  return { ...slice, focused: ticket };
}

export function withPanel(slice: ConsoleSlice, panel: PanelId, visible: boolean): ConsoleSlice {
  const panels = new Map(slice.panels);
  panels.set(panel, visible);
  return { ...slice, panels };
}
