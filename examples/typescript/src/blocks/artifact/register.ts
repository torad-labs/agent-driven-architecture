// ── blocks/artifact/register — THE ONE PUBLIC SYMBOL (G11) ─────────────

import type { Handlers } from "@adr/spine/pure/effect";
import type { BlockRegistration } from "@adr/spine/pure/verb";
import type { ArtifactEffect } from "./contract";
import { isArtifactResult } from "./contract";
import { artifactArm } from "./fold";
import type { DeliveryPort } from "./port";
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
  /** THE EFFECT HANDLERS. Registered exactly like the verbs above and for the
   *  same reason: performing a `ArtifactEffect` case is this block's business, and a
   *  case this table does not answer is a compile error HERE, in the folder that
   *  owns it, rather than a missing branch at the composition root. The root
   *  binds the dependency and assembles; it names no kind but `Diag`. */
  handlers: (delivery: DeliveryPort): Handlers<ArtifactEffect> => ({
    DeliverArtifact: (effect) => delivery.deliver(effect.lines),
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
