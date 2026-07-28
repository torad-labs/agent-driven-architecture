// ── blocks/escalation/adapter — THE ONLY IMPURE FILE IN THIS BLOCK (G13) ───
// Anything holding a client, a DB handle or a socket lives here — one clearly
// named place per block, never inline in a tool. The DB call ships INSIDE the
// block as port+adapter (4.6/G11); `app/wire` is the only file that decides
// which adapter is real.
//
// The "client" below is a console pager, because this reference runs offline.
// In a real deployment it is a PagerDuty SDK, and nothing else about the block
// changes.

import type { Emit } from "../../spine/pure/emit";
import type { TicketId } from "../../spine/pure/ids";
import type { OncallPort } from "./port";

export function livePager(emit: Emit): OncallPort {
  return {
    page: (ticket: TicketId) => emit(`[pager] on-call paged for ticket ${ticket}`),
  };
}
