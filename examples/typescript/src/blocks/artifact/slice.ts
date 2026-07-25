// ── blocks/artifact/slice — THE ARTIFACT IS A FOLDED SLICE (G16) ───────────
// One line per fold arm. Because the content is State it re-folds, it diffs by
// value, and it is crash-recoverable for free. The regression the old shape
// could not catch — a reducer change that truncates a line while State stays
// byte-identical — is now impossible, because the line IS the State.
//
// `SealStatus` follows `TicketStatus`'s pattern: the parent declares
// `requestedBy`, so the boundary gate reads "is a seal pending, and who asked?"
// off any variant without a match, and a new variant must answer it by
// construction.

import type { Actor, Authority } from "../../spine/pure/actor";
import type { Timestamp } from "../../spine/pure/ids";

export interface ArtifactLine {
  readonly at: Timestamp;
  readonly by: Actor;
  readonly text: string;
}

export type SealStatusKind = "Draft" | "Sealing" | "Sealed";

export interface SealStatusBase {
  readonly kind: SealStatusKind;
  readonly requestedBy: Authority | null;
}

export interface Draft extends SealStatusBase {
  readonly kind: "Draft";
  readonly requestedBy: null;
}

export interface Sealing extends SealStatusBase {
  readonly kind: "Sealing";
  readonly requestedBy: Authority;
}

export interface Sealed extends SealStatusBase {
  readonly kind: "Sealed";
  readonly requestedBy: null;
  readonly at: Timestamp;
  readonly by: Authority;
}

export type SealStatus = Draft | Sealing | Sealed;

export const draft: Draft = { kind: "Draft", requestedBy: null };

export function sealing(requestedBy: Authority): Sealing {
  return { kind: "Sealing", requestedBy };
}

export function sealed(at: Timestamp, by: Authority): Sealed {
  return { kind: "Sealed", requestedBy: null, at, by };
}

export interface ArtifactSlice {
  readonly lines: readonly ArtifactLine[];
  readonly seal: SealStatus;
}

export const emptyArtifactSlice: ArtifactSlice = { lines: [], seal: draft };

export function withLine(slice: ArtifactSlice, line: ArtifactLine): ArtifactSlice {
  return { ...slice, lines: [...slice.lines, line] };
}

export function withSeal(slice: ArtifactSlice, seal: SealStatus): ArtifactSlice {
  return { ...slice, seal };
}
