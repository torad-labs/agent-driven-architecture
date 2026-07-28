// ── blocks/artifact/fold — one line per arm (G16) ──────────────────────────
// 13.1 step 6 used to "perform the delivery effect that writes one line to the
// work product". It folds one line now. Delivery moved to seal time and became
// a single gated irreversible effect.
//
// `ArtifactLine.by` is `sig.by` — the boundary's stamp, arriving with the fold.
// It is NOT something a tool put in its payload, which is exactly the
// distinction G1 exists to enforce.

import type { Signature } from "../../spine/pure/actor";
import type { Timestamp } from "../../spine/pure/ids";
import { rejected } from "../../spine/pure/notice";
import type { ArmOut } from "../../spine/pure/verb";
import { armOut } from "../../spine/pure/verb";
import type { ArtifactResult, DeliverArtifact } from "./contract";
import type { ArtifactSlice, SealStatus } from "./slice";
import { sealed, sealing, withLine, withSeal } from "./slice";

export function artifactArm(
  slice: ArtifactSlice,
  r: ArtifactResult,
  now: Timestamp,
  sig: Signature,
): ArmOut<ArtifactSlice> {
  switch (r.tool) {
    case "recordFinding": {
      if (!isOpen(slice.seal)) {
        return armOut(slice, [], [rejected(now, r.tool, "the work product is already sealed")]);
      }
      return armOut(withLine(slice, { at: now, by: sig.by, text: r.text }), [], []);
    }
    case "requestSeal": {
      if (!isOpen(slice.seal)) {
        return armOut(slice, [], [rejected(now, r.tool, "the work product is already sealed")]);
      }
      // a request is REVERSIBLE — nothing is delivered here
      return armOut(withSeal(slice, sealing(sig.authority)), [], []);
    }
    case "confirmSeal": {
      // reads the PARENT-declared property, so the seal status can grow a
      // variant without adding a match to this arm
      if (slice.seal.requestedBy === null) {
        return armOut(slice, [], [rejected(now, r.tool, "no pending seal request")]);
      }
      const delivery: DeliverArtifact = { kind: "DeliverArtifact", at: now, lines: slice.lines };
      return armOut(withSeal(slice, sealed(now, sig.authority)), [delivery], []);
    }
    default: {
      const _never: never = r;
      return _never;
    }
  }
}

// The block's ONE closed match over SealStatus.
function isOpen(seal: SealStatus): boolean {
  switch (seal.kind) {
    case "Draft":
      return true;
    case "Sealing":
      return true;
    case "Sealed":
      return false;
    default: {
      const _never: never = seal;
      return _never;
    }
  }
}
