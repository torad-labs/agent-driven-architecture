// ── blocks/console/fold — a presentation ARM obeys the same three rules ────
// It reads current state, it folds a per-item Notice when it refuses, and it
// never touches the session-global RunStatus. Nothing about presentation earns
// a discount.

import type { Signature } from "@adr/spine/pure/actor";
import type { Timestamp } from "@adr/spine/pure/ids";
import { rejected } from "@adr/spine/pure/notice";
import type { ArmOut } from "@adr/spine/pure/verb";
import { armOut } from "@adr/spine/pure/verb";
import type { ConsoleResult } from "./contract";
import type { ConsoleSlice } from "./slice";
import { knowsPanel, withFocus, withPanel } from "./slice";

export function consoleArm(
  slice: ConsoleSlice,
  r: ConsoleResult,
  now: Timestamp,
  _sig: Signature,
): ArmOut<ConsoleSlice> {
  switch (r.tool) {
    case "focusTicket":
      return armOut(withFocus(slice, r.ticket), [], []);
    case "setPanel": {
      if (!knowsPanel(slice, r.panel)) {
        return armOut(slice, [], [rejected(now, r.tool, `unknown panel ${r.panel}`)]);
      }
      return armOut(withPanel(slice, r.panel, r.visible), [], []);
    }
    default: {
      const _never: never = r;
      return _never;
    }
  }
}
