/**
 * STOP BEACON — silence is a system bug.
 *
 * Fires when a turn ends. Writes a timestamped beacon recording what was open at the moment the
 * seat went quiet, so an external watcher can tell the difference between "finished" and "died"
 * — from outside the session, which is the only place that distinction can be drawn.
 *
 * The failure this exists for is specific and has happened: a seat finishes its queue and sits
 * idle while work waits, and nobody notices until a human looks. An idle seat with a non-empty
 * queue is a DEFECT, not a pause. The beacon is what makes that state observable rather than
 * something someone has to happen to check.
 *
 * It also surfaces the observation to the agent when the queue is genuinely non-empty, because
 * the cheapest moment to catch a premature stop is the instant it happens.
 */

import { locateItems, readLines } from "../../../dev/campaigns/ledger-core.ts";
import { LEDGER } from "../repo.ts";
import type { HookModule, HookPayload, HookVerdict } from "../types.ts";

const BEACON = ".claude/.stop-beacon.json";

export const module: HookModule = {
  order: 13,
  name: "13-stop-beacon",
  events: ["Stop"],

  async run(payload: HookPayload): Promise<HookVerdict> {
    const root = payload.cwd ?? process.cwd();
    const lines = await readLines(`${root}/${LEDGER}`).catch(() => null);

    const items = lines === null ? [] : locateItems(lines).map((block) => block.item);
    const inFlight = items.filter((item) => item.status === "in_flight").map((item) => item.id);
    const todo = items.filter((item) => item.status === "todo").map((item) => item.id);

    await Bun.write(
      `${root}/${BEACON}`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          session: payload.session_id ?? null,
          in_flight: inFlight,
          todo_count: todo.length,
          // The state a watcher should alert on: the seat went quiet with work still open.
          silent_with_queue: inFlight.length > 0 || todo.length > 0,
        },
        null,
        2,
      ),
    );

    if (inFlight.length === 0) return null;

    return {
      kind: "context",
      text:
        `STOP BEACON: this turn ended with ${inFlight.join(", ")} still marked in_flight.\n` +
        `Either the item landed and its status was never moved, or it did not land and the ledger ` +
        `is now telling the next session something untrue. Close it out or leave a dated note ` +
        `saying where it actually stands — a stale in_flight is how a campaign starts lying.`,
    };
  },
};

export default module;
