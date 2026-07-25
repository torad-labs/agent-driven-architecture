// ── blocks/inbox/slice — the load the consumer shed, per source ────────────
// PURE, copy-on-write. Counts are per SOURCE because the policy is per source:
// a perishable sensor feed conflating is normal, and a durable ticket queue
// conflating would be a bug — so a single global counter would hide the only
// distinction that matters.
//
// The fault list is BOUNDED at the source, the same way every other slice bounds
// what it contributes to the reasoner's digest.

import type { SourceName, Timestamp } from "../../spine/pure/ids";

export interface InboxFault {
  readonly at: Timestamp;
  readonly source: SourceName;
  readonly fault: string;
}

export interface InboxSlice {
  readonly conflated: ReadonlyMap<SourceName, number>;
  readonly duplicates: ReadonlyMap<SourceName, number>;
  readonly faults: readonly InboxFault[];
}

/** the most recent faults only — a slice may not grow with session length */
export const MAX_INBOX_FAULTS = 8;

export const emptyInboxSlice: InboxSlice = {
  conflated: new Map(),
  duplicates: new Map(),
  faults: [],
};

export function conflatedOf(slice: InboxSlice, source: SourceName): number {
  return slice.conflated.get(source) ?? 0;
}

export function duplicatesOf(slice: InboxSlice, source: SourceName): number {
  return slice.duplicates.get(source) ?? 0;
}

export function withConflated(slice: InboxSlice, source: SourceName, dropped: number): InboxSlice {
  const conflated = new Map(slice.conflated);
  conflated.set(source, conflatedOf(slice, source) + dropped);
  return { ...slice, conflated };
}

export function withDuplicate(slice: InboxSlice, source: SourceName): InboxSlice {
  const duplicates = new Map(slice.duplicates);
  duplicates.set(source, duplicatesOf(slice, source) + 1);
  return { ...slice, duplicates };
}

export function withFault(slice: InboxSlice, fault: InboxFault): InboxSlice {
  const faults = [...slice.faults, fault];
  return { ...slice, faults: faults.length <= MAX_INBOX_FAULTS ? faults : faults.slice(faults.length - MAX_INBOX_FAULTS) };
}
