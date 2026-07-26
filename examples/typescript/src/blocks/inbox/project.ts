// ── blocks/inbox/project — TWO projections, and the second one is the point ─
// The view row is for the operator. The CONTEXT LINE is for the model, and it is
// what makes "observable, never silent" mean something: the reasoner is told, in
// its own input, that the system is shedding load on its behalf.
//
//     "2 input(s) conflated from ticket-stream"
//     "1 turn(s) failed: backend timeout"
//
// An agent that does not know it dropped two inputs will confidently answer as
// if it saw them.

import { bounded, MAX_CONTEXT_LINES_PER_BLOCK } from "../../spine/pure/context";
import type { InboxSlice } from "./slice";

export interface InboxRow {
  readonly source: string;
  readonly conflated: number;
  readonly duplicates: number;
}

export interface InboxView {
  readonly rows: readonly InboxRow[];
  readonly faults: readonly string[];
}

export function inboxView(slice: InboxSlice): InboxView {
  const sources = [...new Set([...slice.conflated.keys(), ...slice.duplicates.keys()])];
  return {
    rows: sources.map((source) => ({
      source,
      conflated: slice.conflated.get(source) ?? 0,
      duplicates: slice.duplicates.get(source) ?? 0,
    })),
    faults: slice.faults.map((f) => `${f.source}: ${f.fault}`),
  };
}

export function inboxContextLines(slice: InboxSlice): readonly string[] {
  const drops = [...slice.conflated.entries()].map(
    ([source, dropped]) => `${dropped} input(s) conflated from ${source} — you did not see them`,
  );
  const dupes = [...slice.duplicates.entries()].map(
    ([source, count]) => `${count} duplicate input(s) refused from ${source}`,
  );
  const faults = slice.faults.map((f) => `turn failed on ${f.source}: ${f.fault}`);
  return bounded([...drops, ...dupes, ...faults], MAX_CONTEXT_LINES_PER_BLOCK);
}
