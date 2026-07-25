// ── blocks/escalation/port — the block's PRIVATE frozen contract ───────────
// An interface, nothing else (check C11). The block owns its dependency; the
// composition root binds it. No sibling and no spine file names this type.

import type { TicketId } from "../../spine/pure/ids";

export interface OncallPort {
  page(ticket: TicketId): void;
}
