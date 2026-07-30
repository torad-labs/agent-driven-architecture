// ── blocks/artifact/project — the two pure projections ─────────────────────
// The context projection contributes a COUNT and a status, never the lines
// themselves (§5.2's growth bound): the reasoner's input must not grow with the
// artifact.

import { bounded, MAX_CONTEXT_LINES_PER_BLOCK } from "@adr/spine/pure/context";
import type { ArtifactLine, ArtifactSlice, SealStatus } from "./slice";

export interface ArtifactView {
  readonly lines: readonly ArtifactLine[];
  readonly lineCount: number;
  readonly seal: string;
  readonly canSeal: boolean;
}

export function artifactView(slice: ArtifactSlice): ArtifactView {
  return {
    lines: slice.lines,
    lineCount: slice.lines.length,
    seal: sealLabel(slice.seal),
    // the PARENT-declared property again, not an `===` against one variant
    canSeal: slice.seal.requestedBy !== null,
  };
}

function sealLabel(seal: SealStatus): string {
  switch (seal.kind) {
    case "Draft":
      return "draft";
    case "Sealing":
      return "seal requested";
    case "Sealed":
      return `sealed at ${seal.at}`;
    default: {
      const _never: never = seal;
      return _never;
    }
  }
}

export function artifactContextLines(slice: ArtifactSlice): readonly string[] {
  return bounded(
    [`work product: ${slice.lines.length} line(s), ${sealLabel(slice.seal)}`],
    MAX_CONTEXT_LINES_PER_BLOCK,
  );
}
