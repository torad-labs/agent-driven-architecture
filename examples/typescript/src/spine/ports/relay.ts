// ── spine/ports/relay — the tier relay's READ side (11.2) ──────────────────
// INTERFACES ONLY (C11).
//
// A deep tier publishes conclusions to an append-only relay; a fast tier reaches
// them ONLY through here, and gets TEXT back. No method handle, no shared
// mutable object, no synchronous request — so "the deep tier never stalls the
// hot loop" is structural rather than aspirational.
//
// NOTE WHAT THIS INTERFACE DOES NOT PROMISE. It does not promise to be fast, and
// it does not promise to return at all. A port that promised "I will answer
// inside your deadline" would be exactly the aspirational guarantee 11.2 warns
// against — the party that must not block is the one that has to do the
// bounding, so the DEADLINE LIVES IN THE CONSUMER and the degrade is typed
// (`Recall`), not silent.
//
// The WRITE side is deliberately not here: publishing is a feature's dependency
// (`blocks/analysis/port`), bound at the composition root like any other. Split
// by direction, and the split is the architecture's own line.

import type { RelayEntry } from "../pure/staged";

export interface RelayRead {
  /** MAY be slow. MAY never return. The consumer bounds it. */
  latest(): Promise<RelayEntry | null>;
}
