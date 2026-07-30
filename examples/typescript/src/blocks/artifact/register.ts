// ── blocks/artifact/register — THE ONE PUBLIC SYMBOL (G11) ─────────────

import type { BlockRegistration } from "@adr/spine/pure/verb";
import { isArtifactResult } from "./contract";
import { artifactArm } from "./fold";
import { artifactContextLines, artifactView } from "./project";
import type { ArtifactSlice } from "./slice";
import { emptyArtifactSlice } from "./slice";
import { artifactVerbs } from "./tools";

export const artifact = {
  name: "artifact",
  register: <S>(read: (state: S) => ArtifactSlice): BlockRegistration<S> => ({
    block: "artifact",
    verbs: artifactVerbs<S>(read),
  }),
  arm: artifactArm,
  view: artifactView,
  contextLines: artifactContextLines,
  owns: isArtifactResult,
  emptySlice: emptyArtifactSlice,
} as const;

export type { ArtifactCommand, ArtifactEffect, ArtifactResult, DeliverArtifact } from "./contract";
export type { DeliveryPort } from "./port";
export type { ArtifactView } from "./project";
export type { ArtifactLine, ArtifactSlice, SealStatus } from "./slice";
