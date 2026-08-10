/**
 * IN-FLIGHT RE-ANCHOR — what was I doing?
 *
 * Compaction is the moment a session most resembles a new hire holding someone else's half-built
 * work. The laws come back via module 10; this module restores the WORK: which items are open,
 * what their fences and verify gates are, and the most recent notes on each.
 *
 * Notes are the construction diary, so the tail of them is the resume pointer. This is exactly
 * why the ledger CLI edits lines instead of round-tripping a TOML serializer — under a serializer
 * every note here would already be gone, and this module would have nothing to restore.
 *
 * Bounded on purpose: two items, four notes each. An unbounded re-anchor becomes its own context
 * problem at precisely the moment context is scarcest.
 */

import { locateItems, notesOf, readLines } from "../../../dev/campaigns/ledger-core.ts";
import { LEDGER } from "../repo.ts";
import type { HookModule, HookPayload, HookVerdict } from "../types.ts";

const MAX_ITEMS = 2;
const MAX_NOTES = 4;

export const module: HookModule = {
  order: 11,
  name: "11-inflight-reanchor",
  events: ["SessionStart", "PreCompact"],

  async run(payload: HookPayload): Promise<HookVerdict> {
    const root = payload.cwd ?? process.cwd();
    const lines = await readLines(`${root}/${LEDGER}`).catch(() => null);
    if (lines === null) return null;

    const blocks = locateItems(lines);
    const open = blocks.filter(
      (block) => block.item.status === "in_flight" || block.item.status === "blocked",
    );

    // Nothing open means nothing to re-anchor to. Say nothing rather than say "all clear" — an
    // always-on injection is a tax on every future turn (see module 12).
    if (open.length === 0) return null;

    const sections = open.slice(0, MAX_ITEMS).map((block) => {
      const { item } = block;
      const notes = notesOf(lines, block).slice(-MAX_NOTES);
      return [
        `${item.id} [${item.status}] — ${item.title}`,
        `  fence  : ${item.files.length === 0 ? "(none declared)" : item.files.join(", ")}`,
        `  verify : ${item.verify === "" ? "(none declared)" : item.verify}`,
        ...(notes.length > 0 ? [`  latest notes:`, ...notes.map((note) => `    ${note}`)] : []),
      ].join("\n");
    });

    const overflow =
      open.length > MAX_ITEMS
        ? [``, `(+${open.length - MAX_ITEMS} more open — bun dev/campaigns/ledger.ts ${LEDGER} list)`]
        : [];

    return {
      kind: "context",
      text: [
        `IN-FLIGHT RE-ANCHOR — work that was open when this context boundary hit`,
        ``,
        ...sections,
        ...overflow,
        ``,
        `Finish what is open before starting anything new. If a note contradicts what you believe`,
        `about the tree, the note is the record and your belief is the thing to check.`,
      ].join("\n"),
    };
  },
};

export default module;
