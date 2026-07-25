// ── spine/ports/id-source — the only source of CommandIds (G9) ─────────────
// INTERFACES ONLY (C11).

import type { CommandId } from "../pure/ids";

export interface IdSource {
  next(): CommandId;
}
