/**
 * THE GRANT GATE — load-bearing paths only.
 *
 * Everything that constrains an agent is itself editable by that agent, so the shortest path past
 * an inconvenient wall is to edit the wall. This gate closes that path for the handful of files
 * where breaking them is SILENT — where nothing else in the repository would go red.
 *
 * The guarded set is deliberately small and lives in `../grant-store.ts` with the reasoning for
 * each entry. A gate that fires on routine work gets resented and then disabled; a broad guarded
 * set is not a safer one, only a shorter-lived one. Adding a wall, editing a selftest, writing a
 * new hook module, touching any ordinary source file — none of that needs a grant.
 *
 * Authorisation comes from `/grant <reason>` typed in the prompt box, which reaches
 * `20-grant-issue.ts` through UserPromptSubmit — an event only a human can trigger. That is the
 * difference between this and an attestation flag: a flag like `VERIFY_SNAPSHOT_READ=1` is
 * satisfied by the very party the gate distrusts, and is therefore not a gate at all.
 *
 * SELF-INCLUSION IS THE POINT: this file, and grant-store.ts, are both in the guarded set.
 * Without that, step one of every bypass is to edit the grant gate.
 */

import { isLoadBearing, liveGrant } from "../grant-store.ts";
import {
  repoRelative,
  targetPath,
  type HookModule,
  type HookPayload,
  type HookVerdict,
} from "../types.ts";

// NotebookEdit belongs here too. It was absent, and a notebook is a perfectly good place to put a
// file at a guarded path — the omission was invisible because the matcher listed the tool.
const WRITE_TOOLS: ReadonlySet<string> = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/**
 * GIT, NOT THE FILESYSTEM, decides whether this is a creation or a modification.
 *
 * The first version of the creation carve-out asked `Bun.file(path).exists()`. That is state the
 * distrusted party arranges at will, and it made the round-4 attack executable again with one
 * extra unhooked Bash call:
 *
 *     rm dev/gates/ratchet.ts        # Bash — no PreToolUse, and it was not even audit-logged
 *     Write dev/gates/ratchet.ts     # now reads as "a creation" → free
 *
 * Worse than merely open: the Write that lands a weakened ratchet then reads as ROUTINE — a new
 * gate file — rather than as a guarded modification anyone would look twice at. And the corpus
 * structurally cannot see it, because its payloads run against an intact tree.
 *
 * Git is the right oracle because the adversary cannot arrange it as cheaply. A tracked path stays
 * tracked after `rm`; the deletion is itself a visible change to the index and to the diff. Staged
 * counts too, so `git rm --cached` followed by a Write is still a modification.
 *
 * TWO DELIBERATE CHOICES:
 *   · the RESOLVED, repo-relative path is what gets asked about — never the raw payload string.
 *     Asking about the raw path would let the symlink class closed in round 2 walk straight back
 *     in through this carve-out.
 *   · any failure — git missing, not a repository, command error — reads as KNOWN, i.e. as a
 *     modification. Unknown must be the guarded answer, or the oracle's failure mode becomes the
 *     bypass.
 */
async function isKnownToGit(relativePath: string, cwd: string | undefined): Promise<boolean> {
  const root = cwd ?? process.cwd();
  try {
    /**
     * HEAD FIRST, and this is stronger than the index alone.
     *
     * `ls-files` covers a bare `rm`, but not `rm` FOLLOWED BY `git rm --cached` — after both the
     * path is neither tracked nor staged-present, and the carve-out opens again. Two conspicuous
     * commands instead of one is friction, not a wall.
     *
     * HEAD is history. A seat cannot make a path un-exist at HEAD without committing the deletion,
     * and that commit is itself the permanent, off-machine record the whole design rests on.
     */
    const atHead = await Bun.$`git -C ${root} cat-file -e ${`HEAD:${relativePath}`}`.quiet().nothrow();
    if (atHead.exitCode === 0) return true;

    // Not at HEAD, but possibly added since — a file created and committed-to-index this session
    // is still a modification, not a creation.
    const inIndex = await Bun.$`git -C ${root} ls-files --error-unmatch -- ${relativePath}`
      .quiet()
      .nothrow();
    if (inIndex.exitCode === 0) return true;

    // Exit 1 from BOTH is the honest "git has never heard of this path" — a real creation.
    // Anything else is git failing to answer, and an oracle that cannot answer must not be read
    // as "safe to open".
    return inIndex.exitCode !== 1;
  } catch {
    return true;
  }
}

export const module: HookModule = {
  order: 3,
  name: "03-grant-gate",
  events: ["PreToolUse"],
  // Judges authorisation for an interactive edit. Re-running it at commit time would refuse every
  // commit that legitimately touches enforcement code — including the one that installs it.
  staged: "write-time-only",

  async run(payload: HookPayload): Promise<HookVerdict> {
    if (payload.tool_name === undefined || !WRITE_TOOLS.has(payload.tool_name)) return null;

    const raw = targetPath(payload);
    if (raw === null) return null;

    // Resolved, not string-matched: `ln -s .claude/hooks l` then writing `l/registry.ts` walked
    // through every pattern here until this landed.
    const relative = repoRelative(raw, payload.cwd);
    if (relative === null) return null;

    // Creating a new file under a directory-wide pattern is an ADDITION, and additions are
    // tightening. Modifying one git already knows about is potentially weakening.
    const known = await isKnownToGit(relative, payload.cwd);
    if (!isLoadBearing(relative, known)) return null;

    const root = payload.cwd ?? process.cwd();
    const grant = await liveGrant(root);

    // A grant is bound to the session that asked for it. Without this, one grant taken by the
    // orchestrator opens every concurrent builder for up to eight hours — the sessionId was being
    // recorded and never compared, which is a field that looks like a control and is not.
    if (grant !== null && (grant.sessionId === null || grant.sessionId === payload.session_id)) {
      return null;
    }
    if (grant !== null) {
      return {
        kind: "block",
        reason:
          `Blocked: ${relative} is load-bearing. A grant is live, but it was issued to session ` +
          `${grant.sessionId} and this is ${payload.session_id ?? "an unidentified session"}.\n\n` +
          `Grants are per-session on purpose: otherwise one operator grant opens every concurrent ` +
          `seat for its whole window. Ask the operator to type /grant in THIS session.`,
      };
    }

    return {
      kind: "block",
      reason:
        `Blocked: ${relative} is load-bearing and no grant is live.\n\n` +
        `Breaking this file is SILENT — nothing else in the repository would go red — which is ` +
        // compose-flow correction (2026-07-27, promote upstream): the previous free-list here
        // named lattice.ts, ratchet.ts and book-laws.ts as free, contradicting the dev/gates/**
        // entry in grant-store.ts that gates them. A block message that misstates the guarded
        // set trains readers to distrust it.
        `the whole reason it is on the short list. Most of the harness is still not gated: new ` +
        `hook modules, the lifecycle modules, NEW gates (creations are tightening), the corpus, ` +
        `the rule test fixtures, the specs, the campaign ledger and every ordinary source file ` +
        `are all free.\n\n` +
        `Ask the operator to type this in the prompt box:\n` +
        `    /grant <why this wall has to open>\n` +
        `    /grant 30m <why>          — a shorter window\n\n` +
        `Do not issue it yourself and do not ask in passing. Say what you were trying to change ` +
        `and why the current wall blocks legitimate work. If the wall is wrong, fixing the wall ` +
        `with a red-green proof is the correct move; routing around it never is.`,
    };
  },
};

export default module;
