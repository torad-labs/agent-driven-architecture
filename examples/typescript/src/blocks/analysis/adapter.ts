// ── blocks/analysis/adapter — THE ONLY IMPURE FILE IN THIS BLOCK (G13) ─────
// The relay handle lives here and nowhere else. In a real deployment this is a
// log-structured store, a topic or an append-only table; here it is a supplied
// writer, so the demo and the tests run offline.

import type { Timestamp } from "@adr/spine/pure/ids";
import type { AnalysisRelay } from "./port";

export function liveRelay(write: (at: Timestamp, text: string) => void): AnalysisRelay {
  return {
    publish: (at: Timestamp, text: string) => write(at, text),
  };
}
