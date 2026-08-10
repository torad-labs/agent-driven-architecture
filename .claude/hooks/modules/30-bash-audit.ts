/**
 * BASH AUDIT — a RECORD, not a gate. The distinction is the whole design.
 *
 * This host grants `(ALL) NOPASSWD: ALL`. An agent holding Bash holds root, so a PreToolUse
 * pattern-match on command strings is not a wall — it is a speed bump over an unbounded space of
 * spellings (`sed -i`, `perl -pi`, `tee`, `dd`, `printf >`, a base64'd heredoc, `python`… except
 * not that one). Concept #924 is explicit that mistaking such a filter for enforcement is the
 * error, so this module does not try.
 *
 * What it does instead is make wall-relevant Bash **conspicuous after the fact**. It runs on
 * PostToolUse, refuses nothing, and appends one line per matching command to an append-only log.
 * The design's own currency is that a bypass should be self-incriminating rather than impossible;
 * this is the ledger entry that makes it so.
 *
 * ZERO CONTEXT COST. It always returns null. The log is a file for a human or a watcher to read,
 * never an injection into the conversation — an audit that taxes every turn is an audit that gets
 * removed.
 *
 * WHAT IT CANNOT DO, stated so nobody reads it as protection: an agent with root can delete or
 * rewrite the log. `chattr +a` does not help, because the same sudo that removes the guard removes
 * the attribute. The load-bearing defence remains dev/gates/ratchet.ts — it checks whether the
 * walls still WORK, whatever route was taken, and it runs in CI on a branch that cannot be
 * force-pushed. This log is corroboration, not evidence.
 */

import { appendFileSync } from "node:fs";

import { REPO_NAME } from "../repo.ts";
import type { HookModule, HookPayload, HookVerdict } from "../types.ts";

const LOG = ".claude/.bash-audit.log";

/**
 * Commands worth recording. Deliberately NOT an attempt at completeness — an exhaustive list is
 * the fantasy this module exists to reject. These are the shapes that would matter most in a
 * post-incident read, so they are the ones worth having in order.
 */
const NOTEWORTHY: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\b(sed|perl)\b[^\n]*-i\b/, why: "in-place edit — bypasses the write-path walls" },
  { pattern: /\b(tee|dd)\b/, why: "writes a file without a Write tool call" },
  { pattern: />\s*[^\s|&;]*\.claude\//, why: "redirect into the hook/grant surface" },
  { pattern: />\s*[^\s|&;]*\.rules\//, why: "redirect into the wall rules" },
  { pattern: />\s*[^\s|&;]*dev\/(gates|walls|campaigns|manifests)\//, why: "redirect into gates or ledger state" },
  // Widened after round 6. The old pattern covered only `.claude/hooks`, so the N14 precondition —
  // `rm dev/gates/ratchet.ts` to make a guarded modification read as a creation — was not even
  // logged. Deleting any part of the enforcement surface is the interesting event, not just
  // deleting a hook module.
  {
    pattern: /\b(rm|unlink|shred|mv)\b[^\n]*(\.claude\/|\.rules\/|dev\/gates\/|dev\/walls\/|dev\/manifests\/|dev\/campaigns\/|dev\/githooks\/|sgconfig\.yml|package\.json)/,
    why: "removing or moving part of the enforcement surface",
  },
  { pattern: /\bgit\s+(push\s+[^\n]*--force|push\s+-f)\b/, why: "force-push — history rewrite" },
  { pattern: /\bgit\s+(checkout|restore|reset)\b[^\n]*--hard|\bgit\s+stash\s+(drop|clear)\b/, why: "destructive git" },
  { pattern: /\bchattr\b|\bsetfacl\b|\bchown\b/, why: "filesystem attribute or ownership change" },
  { pattern: /\bsudo\b/, why: "privilege escalation" },
  { pattern: /\bgh\s+api\b[^\n]*\brulesets?\b/, why: "touching branch protection — the off-machine boundary" },
];

export const module: HookModule = {
  order: 30,
  name: "30-bash-audit",
  events: ["PostToolUse"],

  async run(payload: HookPayload): Promise<HookVerdict> {
    if (payload.tool_name !== "Bash") return null;

    const raw = payload.tool_input?.["command"];
    if (typeof raw !== "string" || raw.trim() === "") return null;

    const hits = NOTEWORTHY.filter((entry) => entry.pattern.test(raw));
    if (hits.length === 0) return null;

    const root = payload.cwd ?? process.cwd();
    const line = JSON.stringify({
      at: new Date().toISOString(),
      repo: REPO_NAME,
      session: payload.session_id ?? null,
      why: hits.map((hit) => hit.why),
      // Truncated: an audit line is a pointer for a human, not a transcript. The full command is
      // already in the session record.
      command: raw.length > 500 ? `${raw.slice(0, 500)}…` : raw,
    });

    /**
     * `appendFileSync`, not read-modify-write.
     *
     * The first version read the whole log and rewrote it. Two PostToolUse firings from parallel
     * Bash calls could then interleave read/read/write/write and silently drop a line — an audit
     * log that loses entries under concurrency is worse than none, because its gaps look like
     * absence of activity. The read also grew with the file.
     *
     * `O_APPEND` makes a single write atomic at this size, so concurrent appends interleave as
     * whole lines rather than corrupting each other.
     */
    appendFileSync(`${root}/${LOG}`, `${line}\n`);

    // Silent by construction. See the header.
    return null;
  },
};

export default module;
