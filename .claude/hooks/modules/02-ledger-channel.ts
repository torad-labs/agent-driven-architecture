/**
 * THE LEDGER IS CLI-ONLY.
 *
 * A raw Write/Edit to a ledger or matrix file skips three things the CLI does for free:
 *   - the flock, so two concurrent seats stop colliding on "file modified since read"
 *   - the re-parse-and-rollback, so a malformed write can never land
 *   - line-based editing, so the `#` comments carrying decisions and resume pointers survive
 *     (a TOML serializer round-trip silently deletes every one of them, and those comments ARE
 *     the memory — concept #945)
 *
 * The CLI is not a convenience wrapper over the file. It is the only channel, and this module is
 * what makes that true rather than aspirational.
 */

import {
  repoRelative,
  targetPath,
  type HookModule,
  type HookPayload,
  type HookVerdict,
} from "../types.ts";

const WRITE_TOOLS: ReadonlySet<string> = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/**
 * Ledger planes, all three (concept #959: manifests, matrix, campaign backlog).
 *
 * Campaigns are matched by DIRECTORY, not by naming one campaign file. The CLI takes a ledger path as
 * its first argument precisely so one binary serves any number of campaigns — guarding a single
 * filename meant the second campaign anyone created would be raw-editable, and nothing would have
 * said so.
 */
const GUARDED: readonly RegExp[] = [
  /^dev\/campaigns\/[^/]+\.toml$/,
  /^dev\/matrix\.toml$/,
  /^dev\/manifests\/.+\.toml$/,
];

function isGuarded(relativePath: string): boolean {
  return GUARDED.some((pattern) => pattern.test(relativePath));
}

export const module: HookModule = {
  order: 2,
  name: "02-ledger-channel",
  events: ["PreToolUse"],
  // Judges HOW a seat may edit, not what may exist. The ledger is checked in and changes on
  // almost every commit — re-running this at commit time would refuse the repo's normal state.
  staged: "write-time-only",

  run(payload: HookPayload): HookVerdict {
    if (payload.tool_name === undefined || !WRITE_TOOLS.has(payload.tool_name)) return null;

    const raw = targetPath(payload);
    if (raw === null) return null;

    const path = repoRelative(raw, payload.cwd);
    if (path === null || !isGuarded(path)) return null;

    return {
      kind: "block",
      reason:
        `Blocked: ${path} is ledger state and the CLI is its only channel.\n\n` +
        `Use these instead:\n` +
        `  bun dev/campaigns/ledger.ts <ledger> note <ID> "text"   # append a dated note\n` +
        `  bun dev/campaigns/ledger.ts <ledger> set-status <ID> <status>\n` +
        `  bun dev/campaigns/ledger.ts <ledger> add --id ... --phase ... --title ...\n` +
        `  bun dev/matrix.ts <matrix> set <ROW> <status> --proof <pointer>\n\n` +
        `A raw edit skips the flock (concurrent seats collide), skips the re-parse-and-rollback ` +
        `(a malformed write lands), and risks a serializer round-trip that would strip the "#" ` +
        `comments — which is where every decision and resume pointer lives. The ledger is the ` +
        `memory; the comments are the memory's content.`,
    };
  },
};

export default module;
