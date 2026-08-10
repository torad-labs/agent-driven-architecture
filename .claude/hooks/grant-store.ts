/**
 * GRANT STORE — the load-bearing surface, and the token that opens it.
 *
 * WHAT NEEDS A GRANT, AND WHY THE LIST IS SHORT
 * The operator's rule: load-bearing changes need authorisation; nothing else should cost a
 * conversation. A gate that fires on routine work gets resented and then disabled, so a broad
 * guarded set is not a safer guarded set — it is a shorter-lived one.
 *
 * The line drawn here is SILENT WEAKENING: a file is on the list when breaking it produces no
 * failure anywhere else. The list itself is the `GUARDED` array below, with a label per entry so
 * nothing has to restate it — including this comment, which is why it no longer does.
 *
 * WHAT THE FIRST VERSION GOT WRONG (external review, 2026-07-27). Five files were argued off the
 * list on the grounds that a second check would catch the damage. Each was reproduced live:
 *
 *   .grant.json     THE TOKEN. Unguarded, so a single Write of an innocuous-looking JSON file
 *                   opened the whole gate — no Bash, nothing an operator would notice.
 *   runner.ts       Set WRITE_PATH_EVENTS to empty and every wall still runs, still returns a
 *                   block, and is discarded. Selftest 53/53, ratchet 27/27, both green. The
 *                   selftest drives modules directly and never the runner, so it could not see it.
 *   selftest.ts     The only check on 02-ledger-channel, which was itself free. One commit
 *                   editing both opens raw ledger writes with nothing going red.
 *   ledger.ts /
 *   ledger-core.ts  The sanctioned writer, the flock, the validate-rollback, and the assertion
 *                   that comments survive. All in the same unguarded family as what checks them.
 *
 * The general shape of the mistake: "a second check catches it" is only true when that check
 * lives OUTSIDE the set being weakened. Four of those five were watched by something in the same
 * free set. The "broad sets get resented" argument still holds — but it applies to files people
 * edit routinely, and nobody routinely edits these.
 *
 * HOW ISSUING IS OPERATOR-ONLY
 * `issue()` is called from exactly one place: `modules/20-grant-issue.ts`, which runs on
 * UserPromptSubmit. That hook fires only on text a human typed into the prompt box — an assistant
 * emits tool calls and assistant messages and can never emit a user prompt. So authorisation
 * originates from a principal the assistant cannot act as, which is the property
 * `VERIFY_SNAPSHOT_READ=1`-style attestation flags lack entirely: those are satisfied by the very
 * party the gate distrusts.
 *
 * WHAT THIS DOES NOT CLAIM. An assistant holding unrestricted Bash on this machine could import
 * this module and call `issue()` directly. Nothing in a filesystem can prevent that. What the
 * design buys is that the intended path is operator-only, and every other path is CONSPICUOUS —
 * the status command is pre-authorised and silent, anything else is an unscoped Bash call the
 * operator sees. Stated plainly here because the previous version of this gate claimed prevention
 * and delivered friction, and that gap is exactly the failure being corrected.
 */

export type Grant = {
  readonly expiresAt: string;
  readonly reason: string;
  readonly grantedBy: string;
  readonly sessionId: string | null;
};

/**
 * Paths whose weakening is silent. Everything else is free — see the header.
 *
 * Each entry carries its own human-readable label so `dev/gates/grant-status.ts` can PRINT this
 * list rather than keeping a second copy of it. The second copy is not hypothetical: the status
 * card advertised a stale set within hours of the guarded set changing, and a card that lies about
 * what is guarded is worse than no card.
 */
/**
 * `newFilesAreTightening` — the carve-out for directory-wide patterns.
 *
 * Guarding `dev/gates/**` wholesale had a regression I introduced and did not notice: CREATING a
 * new gate started requiring a grant, which directly contradicts the rule stated three times in
 * this codebase — adding a wall is tightening and never needs permission. It also blocked the
 * remedy for the CLI-selftest hole, since extracting `ledger-selftest.ts` into `dev/gates/` is a
 * file whose entire purpose is more checking.
 *
 * So for directory patterns, a path that does not yet exist is a CREATION (tightening, free) and
 * a path that does is a MODIFICATION (potentially weakening, gated).
 *
 * NOT blanket, and that distinction matters. `settings.gradle.kts` and `build.gradle.kts` are
 * guarded precisely BEFORE they exist — the guard stands waiting rather than being remembered
 * afterwards — so a blanket new-file carve-out would silently undo that. The flag is opt-in per
 * entry for exactly this reason.
 */
const GUARDED: readonly {
  readonly pattern: RegExp;
  readonly label: string;
  readonly newFilesAreTightening?: true;
}[] = [
  { pattern: /(^|\/)sgconfig\.yml$/, label: "sgconfig.yml" },
  { pattern: /(^|\/)\.rules\/[^/]+\/ast-grep\/rules\//, label: ".rules/<lang>/ast-grep/rules/**" },
  { pattern: /(^|\/)\.claude\/settings\.json$/, label: ".claude/settings.json" },
  { pattern: /(^|\/)\.claude\/\.grant\.json$/, label: ".claude/.grant.json  (the token itself)" },
  { pattern: /(^|\/)\.claude\/hooks\/registry\.ts$/, label: ".claude/hooks/registry.ts" },
  { pattern: /(^|\/)\.claude\/hooks\/runner\.ts$/, label: ".claude/hooks/runner.ts" },
  { pattern: /(^|\/)\.claude\/hooks\/selftest\.ts$/, label: ".claude/hooks/selftest.ts" },
  { pattern: /(^|\/)\.claude\/hooks\/grant-store\.ts$/, label: ".claude/hooks/grant-store.ts" },
  { pattern: /(^|\/)\.claude\/hooks\/modules\/03-grant-gate\.ts$/, label: ".claude/hooks/modules/03-grant-gate.ts" },
  /**
   * EVERY GATE, not an enumerated subset.
   *
   * This was two entries — `no-python.ts` and `staged.ts` — and the omission was the last rung of
   * the recursion: the ratchet guards every wall, `ratchet-selftest` guards the ratchet, and
   * NOTHING guarded that pair. Proven live: neuter ratchet-3a, drop its regression case, and run
   * the N5 delete+add attack in one commit — local gate green, CI green, because CI faithfully
   * executes the pushed, weakened ratchet. Nothing automated goes red anywhere.
   *
   * Applying this file's own criterion honestly, it is not two files but the whole directory.
   * Every gate here is SILENT when weakened, and none is routinely edited:
   *
   *   ratchet.ts           corpus coverage retires with no signal
   *   ratchet-selftest.ts  the ratchet's only witness
   *   no-python.ts         the checker the hook and the sweep share
   *   staged.ts            the commit-time half of same-checker-twice
   *   lattice.ts           manifest ↔ matrix drift goes undetected
   *   hookpath.ts          the pre-commit hook silently uninstalls
   *   grant-status.ts      WORSE than unguarded — a weakened status card lies about what is
   *                        guarded, actively misinforming rather than merely failing to inform
   *
   * The counter-argument — "append-only history makes any weakening visible forever" — applied
   * identically to runner.ts and selftest.ts, and both were guarded anyway. Visibility is not a
   * red check, and that distinction is the entire reason the ratchet exists instead of relying on
   * someone reading the diff.
   *
   * IF THIS STARTS FIRING ON ROUTINE WORK, IT IS WRONG. A gate that interrupts ordinary work gets
   * disabled, which is a worse failure than the one it prevents. These are checkers, touched
   * during review rounds and not otherwise; if that stops being true, narrow the pattern rather
   * than living with the friction.
   */
  {
    pattern: /(^|\/)dev\/gates\/[^/]+\.ts$/,
    label: "dev/gates/**  (every gate — each is silent when weakened; NEW gates are free)",
    newFilesAreTightening: true,
  },
  { pattern: /(^|\/)dev\/matrix\.ts$/, label: "dev/matrix.ts" },
  { pattern: /(^|\/)dev\/campaigns\/ledger\.ts$/, label: "dev/campaigns/ledger.ts" },
  { pattern: /(^|\/)dev\/campaigns\/ledger-core\.ts$/, label: "dev/campaigns/ledger-core.ts" },
  // compose-flow addition (2026-07-27, promote upstream with the CLI itself): the third plane's
  // channel. Same criterion as ledger.ts/matrix.ts — the sanctioned writer for a guarded plane,
  // silent when weakened, never routinely edited.
  { pattern: /(^|\/)dev\/manifest\.ts$/, label: "dev/manifest.ts" },
  // THE GATE CHAIN'S ROOT. `bun run gate` is what CI and every seat invoke, but the definition of
  // that chain is one &&-separated line in package.json. Dropping `gate:ratchet` from it leaves
  // CI green with the load-bearing defence never run — silent weakening by this file's own
  // criterion, and package.json is not a routinely-edited file so guarding it costs nothing.
  // CI additionally invokes the three critical gates DIRECTLY, because a gate should not depend
  // on a guard when it can simply not have the hole.
  { pattern: /(^|\/)package\.json$/, label: "package.json  (the gate chain)" },
  { pattern: /(^|\/)settings\.gradle\.kts$/, label: "settings.gradle.kts  (once it exists)" },
  { pattern: /(^|\/)build\.gradle\.kts$/, label: "build.gradle.kts  (once it exists)" },
];

/** The guarded set as printable labels. One source, so the status card cannot drift from the law. */
export function guardedLabels(): readonly string[] {
  return GUARDED.map((entry) => entry.label);
}


/**
 * Is this path load-bearing?
 *
 * `existsOnDisk` is supplied by the caller rather than read here, so this stays pure and the
 * selftest can drive both branches without touching a filesystem. Callers that cannot tell should
 * pass `true` — treating an unknown as an existing file fails CLOSED.
 */
export function isLoadBearing(path: string, existsOnDisk = true): boolean {
  return GUARDED.some((entry) => {
    if (!entry.pattern.test(path)) return false;
    // A new file under a directory-wide pattern is an addition, and additions are tightening.
    if (entry.newFilesAreTightening === true && !existsOnDisk) return false;
    return true;
  });
}

/**
 * NOT EXPORTED, AND THAT IS THE POINT (N22).
 *
 * It was exported, and `dev/gates/ratchet.ts` used it to ask `Bun.file(grantPath(root)).exists()`
 * — "is there a token file" — instead of `liveGrant()` — "is there a grant". Those are different
 * questions, and the gap between them is N21: `revoke()` deletes the token but expiry does not, so
 * an expired grant blocked the load-bearing gate forever while every other reader correctly saw no
 * grant at all.
 *
 * Fixing that caller left the escape open for the next one. Un-exporting closes it structurally:
 * no file outside this one can construct the path, so the wrong question cannot be asked, and tsc
 * says so rather than a reviewer catching it on round eleven. That is make-drift-not-compile
 * applied to the exact hole it was written for.
 *
 * The rejected alternative was deleting the expired token on read. It would have killed the dead
 * state, but at two costs: the token carries reason/grantedBy/sessionId and IS the audit trail the
 * grant exists to leave, and a reader still calling exists() would misread it only when it ran
 * before whoever deleted it — turning a deterministic bug into an ordering-dependent one. The
 * expired token now lingers deliberately. It is the receipt, and nothing can misread it because
 * nothing can ask about it.
 *
 * `dev/gates/grant-path-wall.ts` is the backstop for hardcoding the path around this.
 */
/**
 * The token's repo-relative path, exported because two legitimate uses need to NAME it without
 * reading it: the hook witness asserts the guarded set covers the token itself, and the wall needs
 * something to compare against. Naming the path is fine; what N21 punished was ASKING THE FILE a
 * question only `liveGrant()` can answer.
 */
export const TOKEN_RELPATH = ".claude/.grant.json";

function grantPath(root: string): string {
  return `${root}/${TOKEN_RELPATH}`;
}

/**
 * Place a token in a SANDBOX, for witnesses that must exercise grant states.
 *
 * Two selftests need to fabricate tokens — a live one, an expired one, one past the clamp — and
 * `issue()` cannot produce an expired grant because it clamps on write. Before this existed they
 * hardcoded the path, which put the token path in three files and re-opened the N22 escape by the
 * back door.
 *
 * So the store still owns the path and callers declare INTENT instead. The name cannot be mistaken
 * for a liveness check the way `grantPath(root)` could; there is no plausible misreading of
 * `writeTokenFixture` as "is a grant live".
 *
 * This adds no authority that was not already exported: `issue()` is exported for module 20, and
 * on a host with NOPASSWD root the token was always writable by anything holding Bash. What it
 * buys is that the path has exactly one owner, which is the property the wall checks.
 */
export async function writeTokenFixture(sandboxRoot: string, grant: Grant): Promise<string> {
  const path = grantPath(sandboxRoot);
  await Bun.write(path, `${JSON.stringify(grant, null, 2)}\n`);
  return path;
}

/** Hard ceilings applied at issue AND at read, so a hand-edited expiry does not survive. */
const MAX_HOURS = 8;
const DEFAULT_HOURS = 2;

/**
 * The live grant, or null. Fails closed on every ambiguity: absent, unparseable, undated,
 * expired, or dated beyond the clamp all read as "no grant".
 */
export async function liveGrant(root: string): Promise<Grant | null> {
  // HERMETIC AT-REST MEASUREMENT (operator ruling 2026-08-02, promote upstream): the ratchet sets
  // this to measure the walls' resting state without demanding live grants be revoked first.
  // Forcing the answer to "no grant" can only make every consumer BLOCK MORE, never less — the
  // flag opens nothing, so it is useless as a bypass and safe by construction.
  if (process.env["GRANT_STORE_ASSUME_REST"] === "1") return null;
  const raw = await Bun.file(grantPath(root)).json().catch(() => null);
  if (raw === null || typeof raw !== "object") return null;

  const grant = raw as Partial<Grant>;
  if (typeof grant.expiresAt !== "string") return null;

  const expires = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expires)) return null;
  if (expires <= Date.now()) return null;
  // Re-clamp on read: an expiry edited to next year is not honoured just because it parsed.
  if (expires > Date.now() + MAX_HOURS * 3_600_000) return null;

  return {
    expiresAt: grant.expiresAt,
    reason: typeof grant.reason === "string" ? grant.reason : "(none recorded)",
    grantedBy: typeof grant.grantedBy === "string" ? grant.grantedBy : "(unknown)",
    sessionId: typeof grant.sessionId === "string" ? grant.sessionId : null,
  };
}

/**
 * Issue a grant. CALLED FROM EXACTLY ONE PLACE — modules/20-grant-issue.ts, on a typed prompt.
 * Do not add a CLI entrypoint to this file "for convenience"; that would hand the assistant the
 * issue path and the gate would be decorative. Same rule, same reasoning, as the global
 * grant:worktree module.
 */
export async function issue(
  root: string,
  hours: number,
  reason: string,
  sessionId: string | null,
): Promise<Grant> {
  const clamped = Math.min(Math.max(hours, 0.05), MAX_HOURS);
  const grant: Grant = {
    expiresAt: new Date(Date.now() + clamped * 3_600_000).toISOString(),
    reason,
    // Honest attribution: the authority is a human typing into the prompt line, nothing else.
    grantedBy: "operator (typed /grant in the prompt line)",
    sessionId,
  };
  await Bun.write(grantPath(root), `${JSON.stringify(grant, null, 2)}\n`);
  return grant;
}

export async function revoke(root: string): Promise<boolean> {
  const file = Bun.file(grantPath(root));
  if (!(await file.exists())) return false;
  await file.delete();
  return true;
}

export const DEFAULTS = { DEFAULT_HOURS, MAX_HOURS } as const;
