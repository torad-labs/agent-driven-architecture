// ── spine/pure/view — the ViewModel ROOT (6.9) ──────────────────────────────
// Pure. Every presentational flag is pre-decided here or in a block's own view;
// the surface applies flags, it never computes them. Each block's view composes
// into this root, so a surface receives exactly ONE immutable value (G8).

import type { SpineSlice } from "./spine-slice";
import { renderNotice } from "./notice";

export interface ViewModel {
  readonly banner: string;
  readonly notices: readonly string[];
}

export function spineView(slice: SpineSlice): ViewModel {
  return { banner: bannerFor(slice), notices: slice.notices.map(renderNotice) };
}

// A per-item rejection must NEVER reach this banner (F9). Only the boundary can
// put the session into Degraded or Error, so only a session-level cause shows.
function bannerFor(slice: SpineSlice): string {
  const run = slice.run;
  switch (run.kind) {
    case "Idle":
      return "ok";
    case "Working":
      return `working: step ${run.step}`;
    case "Degraded":
      return `degraded: ${run.cause}`;
    case "Error":
      return `error: ${run.fault}`;
    default: {
      const _never: never = run;
      return _never;
    }
  }
}
