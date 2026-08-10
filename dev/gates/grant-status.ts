#!/usr/bin/env bun
/**
 * GRANT STATUS — read-only, on purpose.
 *
 * This is the script behind the `!` line in `.claude/commands/grant.md`, which means an assistant
 * can run it without a permission prompt. It therefore has NO path to issue or revoke: it imports
 * `liveGrant` and `isLoadBearing` and nothing else. Adding an issue mode here "for convenience"
 * would hand the assistant the very authority the gate exists to withhold, and the gate would
 * become decorative.
 *
 * Issuing lives in `.claude/hooks/modules/20-grant-issue.ts`, reachable only from text a human
 * typed into the prompt box.
 */

import { guardedLabels, liveGrant } from "../../.claude/hooks/grant-store.ts";

const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim();
const grant = await liveGrant(root);

// DERIVED, never restated. This list was hardcoded for exactly as long as it took the guarded set
// to change once, after which the card confidently advertised a set that was no longer the truth.
// A status card that lies about what is guarded is worse than no card, because it is believed.
const GUARDED = guardedLabels();

const lines: string[] = [];

if (grant === null) {
  lines.push("GRANT — none live. Load-bearing paths are closed.");
} else {
  const minutes = Math.round((Date.parse(grant.expiresAt) - Date.now()) / 60_000);
  lines.push(`GRANT — LIVE, ${minutes} minute(s) remaining`);
  lines.push(`  until   ${grant.expiresAt}`);
  lines.push(`  reason  ${grant.reason}`);
  lines.push(`  by      ${grant.grantedBy}`);
}

lines.push("");
lines.push("Guarded — these are the only paths that need a grant:");
for (const path of GUARDED) lines.push(`  ${path}`);
lines.push("");
lines.push("Everything else is free: new hook modules, the lifecycle modules, lattice.ts,");
lines.push("book-laws.ts, ratchet.ts, rule test fixtures, the book, the campaign ledger, and all");
lines.push("ordinary source. Adding a wall is tightening and never needs permission.");
lines.push("");
lines.push("A grant is bound to the session that asked for it — it does not open other seats.");
lines.push("");
lines.push("To open one:  /grant <why>          (operator types it; 2h default, 8h max)");
lines.push("              /grant 30m <why>");
lines.push("              /grant revoke");
lines.push("");
lines.push("The grant is an audit trail, not the load-bearing defence. That is dev/gates/");
lines.push("ratchet.ts, checked in CI on a branch that cannot be force-pushed.");

console.log(lines.join("\n"));
