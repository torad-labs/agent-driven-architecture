/**
 * GRANT ISSUANCE — the only path, and it runs on a typed prompt.
 *
 * `/grant 30m widening the no-python sweep` in the prompt box lands here. UserPromptSubmit fires
 * ONLY on text a human typed; an assistant emits tool calls and assistant messages and cannot
 * emit a user prompt. That is what makes issuance operator-only by construction rather than by
 * policy, and it is the whole reason this is a hook module and not a script anyone can run.
 *
 * The companion `.claude/commands/grant.md` is the autocomplete surface only — a UserPromptSubmit
 * interception never appears in the `/` menu, because the menu indexes command FILES. Its `!` line
 * points at a STATUS-ONLY script with no path to `issue()`. Do not give that script an issue mode.
 */

import { DEFAULTS, issue, liveGrant, revoke } from "../grant-store.ts";
import type { HookModule, HookPayload, HookVerdict } from "../types.ts";

const DURATION = /^(\d+)(s|m|h)$/i;
const UNIT_HOURS: Record<string, number> = { s: 1 / 3600, m: 1 / 60, h: 1 };

function card(title: string, lines: readonly string[]): HookVerdict {
  return { kind: "context", text: [title, ...lines].join("\n") };
}

export const module: HookModule = {
  order: 20,
  name: "20-grant-issue",
  events: ["UserPromptSubmit"],

  async run(payload: HookPayload): Promise<HookVerdict> {
    const prompt = (payload.prompt ?? "").trim();
    const [command, ...rest] = prompt.split(/\s+/);
    if (command?.toLowerCase() !== "/grant") return null;

    const root = payload.cwd ?? process.cwd();

    if (rest[0]?.toLowerCase() === "status") {
      const grant = await liveGrant(root);
      return card(
        "GRANT STATUS",
        grant === null
          ? ["  none live — load-bearing paths are closed"]
          : [`  live until ${grant.expiresAt}`, `  reason: ${grant.reason}`],
      );
    }

    if (rest[0]?.toLowerCase() === "revoke") {
      const had = await revoke(root);
      return card("GRANT REVOKED", [had ? "  closed early" : "  nothing was live"]);
    }

    // A bare `<n>s|m|h` is a duration; everything else is the reason.
    let hours = DEFAULTS.DEFAULT_HOURS;
    const words: string[] = [];
    for (const word of rest) {
      const match = word.match(DURATION);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        hours = Number(match[1]) * (UNIT_HOURS[match[2].toLowerCase()] ?? 1);
        continue;
      }
      words.push(word);
    }

    const reason = words.join(" ").trim();
    if (reason === "") {
      // The reason is the only audit trail a later reader gets for why a wall was opened, so it
      // is required. This is the one piece of ceremony the grant keeps.
      return card("GRANT REFUSED — no reason given", [
        "  usage: /grant [30m] <why this wall has to open>",
        "         /grant status",
        "         /grant revoke",
        "",
        `  default ${DEFAULTS.DEFAULT_HOURS}h, clamped to ${DEFAULTS.MAX_HOURS}h.`,
      ]);
    }

    const grant = await issue(root, hours, reason, payload.session_id ?? null);
    return card("GRANT ISSUED", [
      `  until   ${grant.expiresAt}`,
      `  reason  ${grant.reason}`,
      ``,
      `  Opens only the load-bearing set: sgconfig.yml, .rules/**/rules/, settings.json,`,
      `  registry.ts, 03-grant-gate.ts, grant-store.ts, no-python.ts, staged.ts, matrix.ts,`,
      `  and the Gradle build files. Nothing else was ever gated.`,
      ``,
      `  It does not skip a gate. Every check still has to pass.`,
    ]);
  },
};

export default module;
