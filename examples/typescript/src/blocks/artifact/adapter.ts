// ── blocks/artifact/adapter — THE ONLY IMPURE FILE IN THIS BLOCK (L4) ──────
// The delivery client lives here and nowhere else. In a real deployment this
// writes to object storage or a ticketing system; here it writes lines to a
// caller-supplied emitter, so the demo runs offline.

import type { DeliveryPort } from "./port";

export function liveDelivery(emit: (line: string) => void = console.log): DeliveryPort {
  return {
    deliver: (lines) => {
      emit(`[delivery] work product sealed, ${lines.length} line(s):`);
      lines.forEach((line) => emit(`  ${line.at} ${line.by}: ${line.text}`));
    },
  };
}
