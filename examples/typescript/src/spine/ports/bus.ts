// ── spine/ports/bus — the append-only timeline (F8, D6) ────────────────────
// INTERFACES ONLY (C11).
//
// `append` returns the committed offset. That return value is the ORIGIN of
// every effect key, which is why commit cannot be reordered after perform: the
// key does not exist until the append has returned.

import type { StepIndex } from "../pure/ids";
import type { StepRecord } from "../pure/step-record";

export interface Bus {
  append(record: StepRecord): StepIndex;
  records(): readonly StepRecord[];
}
