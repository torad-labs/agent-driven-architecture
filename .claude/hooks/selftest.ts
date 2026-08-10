#!/usr/bin/env bun
/**
 * THE HOOK CHAIN SELFTEST — run at every vendoring and in the gate.
 *
 * Each case drives a module directly with a synthetic payload and asserts the verdict. This is
 * the red-green discipline from concept #960 mechanism 1 ("walls before buildings"): a guard is
 * proven against a SYNTHETIC violation before it is trusted with a real one. A guard nobody has
 * watched refuse anything is a guard nobody knows works.
 *
 * The chain-shape assertion at the end is deliberate. A wall that silently drops out of the
 * registry is the failure this whole file exists to make impossible.
 */

import { registry } from "./registry.ts";
import { TOKEN_RELPATH, writeTokenFixture } from "./grant-store.ts";
import type { HookPayload, HookVerdict } from "./types.ts";

const CWD = "/repo";

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ""): void {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`  FAIL  ${label}${detail === "" ? "" : `\n        ${detail}`}`);
}

function write(path: string, content = ""): HookPayload {
  return { tool_name: "Write", tool_input: { file_path: path, content }, cwd: CWD };
}

async function verdictOf(name: string, payload: HookPayload): Promise<HookVerdict> {
  const found = registry.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`module ${name} is not registered`);
  return await found.run(payload);
}

async function blocks(name: string, payload: HookPayload, label: string): Promise<void> {
  const verdict = await verdictOf(name, payload);
  check(label, verdict?.kind === "block", `expected a block, got ${verdict?.kind ?? "null"}`);
}

async function allows(name: string, payload: HookPayload, label: string): Promise<void> {
  const verdict = await verdictOf(name, payload);
  check(label, verdict === null, `expected null, got ${verdict?.kind ?? "null"}`);
}

console.log("hook selftest");

// ── 01-no-python — NOT PORTED ────────────────────────────────────────────────────────────────
// compose-flow's operator law, and its checks lived here. It did not come across (this tree's
// own enforcement layer is currently Python) — see dev/campaigns/setup/VENDORED.md. Removing the
// module without removing its checks would have left the chain asserting a wall that is absent,
// which is the fake-green this file exists to prevent.

// ── 02-ledger-channel ─────────────────────────────────────────────────────────────────────────
await blocks(
  "02-ledger-channel",
  write(`${CWD}/dev/campaigns/setup.toml`, ""),
  "blocks a raw campaign-ledger edit",
);
await blocks("02-ledger-channel", write(`${CWD}/dev/matrix.toml`, ""), "blocks a raw matrix edit");
await blocks(
  "02-ledger-channel",
  write(`${CWD}/dev/manifests/compose-flow.toml`, ""),
  "blocks a raw composition-manifest edit",
);
await allows(
  "02-ledger-channel",
  write(`${CWD}/dev/campaigns/ledger.ts`, ""),
  "allows editing the CLI itself",
);
await allows(
  "02-ledger-channel",
  write(`${CWD}/package.json`, ""),
  "allows an unrelated TOML-adjacent file",
);

// ── 03-grant-gate ─────────────────────────────────────────────────────────────────────────────
// These run against a REAL temporary tree, not the non-existent /repo the other modules use.
// With a fake cwd the token read fails and every block passes by way of the error path, proving
// only that an unreadable file refuses writes while leaving the grant logic entirely untested.
// That is what an earlier version of this file actually did, at a comfortable 21/21. So: a real
// directory, and every grant state — absent, live, expired, over-clamp, corrupt.
const sandbox = `${process.env["TMPDIR"] ?? "/tmp"}/compose-flow-hook-selftest-${process.pid}`;

function guardedWrite(path: string): HookPayload {
  return { tool_name: "Write", tool_input: { file_path: `${sandbox}/${path}`, content: "" }, cwd: sandbox };
}

/**
 * MATERIALISE the files the guarded-set assertions are about.
 *
 * The sandbox was empty, so every `dev/gates/**` assertion described a path that did not exist. It
 * passed anyway right up until the guard learned to tell a CREATION from a MODIFICATION — at which
 * point the fixture's unfaithfulness became visible, because the gate correctly read those writes
 * as new files.
 *
 * The fixture was wrong the whole time; nothing had asked it the question that would expose it.
 * Which is the same shape as the vacuous grant tests from the first review: a fixture that does not
 * resemble reality passes for reasons unrelated to the property under test.
 */
async function materialise(...paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    const full = `${sandbox}/${path}`;
    await Bun.$`mkdir -p ${full.slice(0, full.lastIndexOf("/"))}`.quiet().nothrow();
    await Bun.write(full, "// fixture\n");
  }

  /**
   * THE SANDBOX MUST BE A GIT REPO, because the guard asks git — not the filesystem — whether a
   * path is a creation or a modification. Without this the oracle fails closed on every path, a
   * genuinely new gate reads as a modification, and the "adding a wall is tightening" case cannot
   * be tested at all.
   *
   * Third time this fixture has been unfaithful in a way that only surfaced when the code learned
   * to ask a sharper question: first it was empty, then it was torn down early, now it lacked the
   * git context the guard depends on. The pattern is consistent — a fixture drifts from reality
   * silently, and the drift is invisible until something asks the question the fixture cannot
   * answer honestly.
   */
  await Bun.$`git -C ${sandbox} init -q`.quiet().nothrow();
  await Bun.$`git -C ${sandbox} add -A`.quiet().nothrow();
  await Bun.$`git -C ${sandbox} -c user.name=t -c user.email=t@t commit -qm fixture`.quiet().nothrow();
}

async function setGrant(expiresAt: Date | null, sessionId: string | null = null): Promise<void> {
  // The token path lives in grant-store.ts and nowhere else (N22): naming it here is how it ended
  // up in three files, which is how ratchet.ts came to ask the file a question only liveGrant()
  // can answer. `writeTokenFixture` exists because `issue()` clamps and cannot mint an expired one.
  const token = `${sandbox}/${TOKEN_RELPATH}`;
  await Bun.$`rm -f ${token}`.quiet();
  if (expiresAt === null) return;
  await writeTokenFixture(sandbox, {
    expiresAt: expiresAt.toISOString(),
    reason: "selftest",
    grantedBy: "selftest",
    sessionId,
  });
}

// State 1 — no grant at all. Only the load-bearing set refuses.
await setGrant(null);

// The gates directory is guarded against MODIFICATION, so the fixture must contain the files the
// assertions below are about, or every one of them describes a creation instead.
// (compose-flow roster: book-laws.ts is absent — no book here — and deletion-guard.ts,
// grant-path-wall.ts, ci-hygiene.ts and the manifest plane CLI are present instead.)
await materialise(
  "dev/gates/no-python.ts",
  "dev/gates/staged.ts",
  "dev/gates/ratchet.ts",
  "dev/gates/ratchet-selftest.ts",
  "dev/gates/cli-selftest.ts",
  "dev/gates/lattice.ts",
  "dev/gates/deletion-guard.ts",
  "dev/gates/grant-path-wall.ts",
  "dev/gates/ci-hygiene.ts",
  "dev/gates/hookpath.ts",
  "dev/gates/grant-status.ts",
  "dev/gates/beacon-check.ts",
  "dev/manifest.ts",
);
await blocks("03-grant-gate", guardedWrite("sgconfig.yml"), "no grant: blocks sgconfig.yml");
await blocks("03-grant-gate", guardedWrite(".rules/python/ast-grep/rules/no-python-source.yml"), "no grant: blocks a wall RULE");
await blocks("03-grant-gate", guardedWrite(".claude/settings.json"), "no grant: blocks the hook wiring");
await blocks("03-grant-gate", guardedWrite(".claude/hooks/registry.ts"), "no grant: blocks the chain declaration");
await blocks("03-grant-gate", guardedWrite("dev/gates/no-python.ts"), "no grant: blocks the shared checker");
await blocks("03-grant-gate", guardedWrite("dev/gates/staged.ts"), "no grant: blocks the commit-time gate");
await blocks("03-grant-gate", guardedWrite("dev/matrix.ts"), "no grant: blocks the fail-closed rule");
await blocks("03-grant-gate", guardedWrite("build.gradle.kts"), "no grant: blocks the module graph before it exists");
await blocks(
  "03-grant-gate",
  guardedWrite(".claude/hooks/modules/03-grant-gate.ts"),
  "no grant: blocks the grant gate ITSELF (closes the bypass recursion)",
);
await blocks("03-grant-gate", guardedWrite(".claude/hooks/grant-store.ts"), "no grant: blocks the guarded-set definition");

// THE TOKEN, THE RUNNER, AND THE CHECKS THAT WATCH THE FREE SET.
// All five were free until an external review (2026-07-27) reproduced each one live. The grant
// token was writable with a single Write of an innocuous JSON file — no Bash. Neutering the
// runner's WRITE_PATH_EVENTS left every wall running, returning blocks, and being ignored, with
// this selftest reporting 53/53 because it drives modules directly and never the runner.
await blocks("03-grant-gate", guardedWrite(TOKEN_RELPATH), "no grant: blocks THE TOKEN ITSELF");
await blocks("03-grant-gate", guardedWrite(".claude/hooks/runner.ts"), "no grant: blocks the runner");
await blocks("03-grant-gate", guardedWrite(".claude/hooks/selftest.ts"), "no grant: blocks this selftest");
await blocks("03-grant-gate", guardedWrite("dev/campaigns/ledger.ts"), "no grant: blocks the sanctioned ledger writer");
await blocks("03-grant-gate", guardedWrite("dev/campaigns/ledger-core.ts"), "no grant: blocks the lock and rollback");
// compose-flow addition (promote upstream with the CLI): the third plane's sanctioned writer.
await blocks("03-grant-gate", guardedWrite("dev/manifest.ts"), "no grant: blocks the manifest plane CLI");

// THE ANTI-BABYSITTING CASES. A gate that fires on routine work gets disabled, so what it does
// NOT stop matters as much as what it does. The guarded set grew today; these hold the line on
// what must stay free.
await allows("03-grant-gate", guardedWrite(".claude/hooks/modules/02-ledger-channel.ts"), "free: an existing wall module");
await allows("03-grant-gate", guardedWrite(".claude/hooks/modules/42-new-wall.ts"), "free: a NEW wall — tightening never needs permission");
await allows("03-grant-gate", guardedWrite(".rules/python/ast-grep/tests/no-python-source-test.yml"), "free: rule TEST fixtures");
// (dev/gates/lattice.ts and dev/gates/ratchet.ts used to be asserted FREE here. Round 4 guarded
// the whole gates directory — every gate there is silent when weakened — so those assertions moved
// to the blocks() list above rather than being deleted. A test that changes sides should say so.)
await allows("03-grant-gate", guardedWrite("dev/campaigns/setup.toml"), "free of THIS wall: the ledger (02 owns it)");
await allows("03-grant-gate", guardedWrite("dev/campaigns/setup/00-BRIEF.md"), "free: the specs");

// PATH RESOLUTION. Walls used to match raw strings, so a symlink hop walked through every pattern
// and an unrelated path merely CONTAINING a guarded name was refused. Both directions matter.
await allows(
  "03-grant-gate",
  { tool_name: "Write", tool_input: { file_path: "/tmp/elsewhere/sgconfig.yml", content: "" }, cwd: sandbox },
  "outside the repo: not this gate's business (no over-blocking)",
);
await blocks(
  "03-grant-gate",
  guardedWrite("dev/../sgconfig.yml"),
  "path traversal resolves to the guarded file",
);

// State 2 — a live grant opens the set, and ONLY for the session it was issued to.
await setGrant(new Date(Date.now() + 60_000), "session-A");
await allows(
  "03-grant-gate",
  { ...guardedWrite("sgconfig.yml"), session_id: "session-A" },
  "live grant: permits a guarded edit IN THE GRANTED SESSION",
);
await allows(
  "03-grant-gate",
  { ...guardedWrite("dev/matrix.ts"), session_id: "session-A" },
  "live grant: permits the fail-closed rule in the granted session",
);
// Without this, one grant taken by the orchestrator opens every concurrent builder for its whole
// window. The sessionId was recorded and never compared — a field that reads as a control and was
// not one.
await blocks(
  "03-grant-gate",
  { ...guardedWrite("sgconfig.yml"), session_id: "session-B" },
  "live grant does NOT open a different concurrent session",
);

// State 3 — expired is not live. Without this a stale token would open the set forever and every
// other check here would still be green.
await setGrant(new Date(Date.now() - 60_000));
await blocks("03-grant-gate", guardedWrite("sgconfig.yml"), "expired grant: refuses again");

// State 4 — an expiry beyond the clamp is refused rather than honoured. This is the hand-edit
// case: writing a far-future date into the token must not buy a longer window than the ceiling.
await setGrant(new Date(Date.now() + 400 * 3_600_000));
await blocks("03-grant-gate", guardedWrite("sgconfig.yml"), "over-clamp expiry: refused, not honoured");

// State 5 — a corrupt token is not an open door.
await Bun.write(`${sandbox}/${TOKEN_RELPATH}`, "{ not json");
await blocks("03-grant-gate", guardedWrite("sgconfig.yml"), "corrupt grant: fails closed");

// ── 04-ast-grep-walls — NOT PORTED ───────────────────────────────────────────────────────────
// Hardwired to compose-flow-core/ paths and that repo's .yml ruleDirs; this tree's .rules are
// .yaml under a registry.json. Its checks go with it — see dev/campaigns/setup/VENDORED.md.

// ── 20-grant-issue: only a typed prompt reaches it ────────────────────────────────────────────
await setGrant(null);
const issued = await verdictOf("20-grant-issue", {
  cwd: sandbox,
  prompt: "/grant 30m widening the sweep",
  session_id: "selftest",
});
check("typing /grant issues a grant", issued?.kind === "context" && issued.text.includes("GRANT ISSUED"));
await allows(
  "03-grant-gate",
  { ...guardedWrite("sgconfig.yml"), session_id: "selftest" },
  "the issued grant opens the set for the session that asked",
);
// The end-to-end version of the binding check: a grant issued by one session must not open
// another, even immediately after issuance.
await blocks(
  "03-grant-gate",
  { ...guardedWrite("sgconfig.yml"), session_id: "some-other-seat" },
  "the issued grant does NOT open a different seat",
);

const noReason = await verdictOf("20-grant-issue", { cwd: sandbox, prompt: "/grant" });
check(
  "a grant with no reason is refused — the reason is the only audit trail",
  noReason?.kind === "context" && noReason.text.includes("REFUSED"),
);

const unrelated = await verdictOf("20-grant-issue", { cwd: sandbox, prompt: "please fix the tests" });
check("ordinary prompts are ignored", unrelated === null);

// (The sandbox teardown used to sit here. Later sections grew that also use `guardedWrite`, and
//  they were silently asserting against a deleted directory — which is why every `dev/gates/**`
//  case read as a creation once the guard learned to tell creations from modifications. Teardown
//  now lives at the very end, after the last thing that touches it.)

// ── lifecycle modules ─────────────────────────────────────────────────────────────────────────
// Driven against the REAL repo, because their whole job is to read the real ledger. A fixture
// would prove only that the fixture parses.
const repo = process.cwd();
const live: HookPayload = { cwd: repo, session_id: "selftest" };

// PORT NOTE (2026-08-07). Upstream these two named `make-drift-not-compile` and the no-python
// law. Neither is in THIS ledger's header, so both were substituted for laws that are — the check
// asserts "the text came from the ledger", and it is only meaningful when the string it looks for
// is one no hook could plausibly hardcode.
//
// The three constants are not ceremony either: this host repo ships a `no-magic-strings` rule that
// refuses a discriminant compared against a literal, and it BLOCKED the first two spellings of
// this edit. Fixed rather than annotated past.
const CONTEXT_KIND = "context";
const LEDGER_ONLY_LAW = "the-verb-is-the-leverage-point";
const ORIGINATING_LAW = "read-the-docs-not-the-types";

const laws = await verdictOf("10-law-injection", live);
check("law injection produces context", laws?.kind === CONTEXT_KIND);
const lawText = laws !== null && laws.kind === CONTEXT_KIND ? laws.text : "";
check(
  "the laws it injects come FROM THE LEDGER, not from the hook",
  lawText.includes(LEDGER_ONLY_LAW),
  "a hardcoded copy in the module would drift the first time a law was amended",
);
check(
  "law injection carries this campaign's originating law",
  lawText.includes(ORIGINATING_LAW),
);

// HONESTY-RECONCILE, 2026-07-27. These two checks previously read "wired to PreCompact, SO THE
// LAWS SURVIVE A COMPACTION". That asserted the wrong mechanism, and I reported a "simulated
// compaction" as proof it worked when all it proved was that the MODULE works.
//
// Per Claude Code's documented behaviour, only UserPromptSubmit and SessionStart inject a hook's
// stdout into the conversation. PreCompact stdout goes to the debug log. So the PreCompact
// registration delivers nothing to the session.
//
// The laws DO survive compaction — via SessionStart with source "compact", which fires on the
// resumed session. That is the mechanism, and it is what these now assert. The PreCompact
// registration is kept because it is harmless and would become live if the channel ever injects,
// but it is no longer described as the thing that carries the laws across.
check(
  "law injection is wired to SessionStart — the channel that ACTUALLY injects, and the one a compaction resumes through",
  registry.find((entry) => entry.name === "10-law-injection")?.events.includes("SessionStart") === true,
);
check(
  "re-anchor is wired to SessionStart too",
  registry.find((entry) => entry.name === "11-inflight-reanchor")?.events.includes("SessionStart") === true,
);
check(
  "PreCompact registration is retained but is NOT the delivery mechanism (documented, not load-bearing)",
  registry.find((entry) => entry.name === "10-law-injection")?.events.includes("PreCompact") === true,
);

// R4 — THE SELFTEST MUST NOT CLOBBER LIVE RUNTIME STATE.
//
// This suite drives the digest and the beacon against the REAL repo, which means it was
// overwriting the digest baseline and `.stop-beacon.json` — the very aliveness signal the beacon
// exists to provide. A watcher checking "has this seat gone quiet with work open" was reading a
// timestamp written by a test run, not by a real turn. The sensor was being reset by its own
// selftest.
//
// Snapshot both, restore both at the end, whatever happens in between.
const RUNTIME_STATE = [
  `${repo}/.claude/.digest-state-selftest.json`,
  `${repo}/.claude/.stop-beacon.json`,
] as const;

const savedRuntimeState = new Map<string, string | null>();
for (const path of RUNTIME_STATE) {
  savedRuntimeState.set(path, await Bun.file(path).text().catch(() => null));
}

async function restoreRuntimeState(): Promise<void> {
  for (const [path, contents] of savedRuntimeState) {
    if (contents === null) await Bun.file(path).delete().catch(() => {});
    else await Bun.write(path, contents);
  }
}

// THE ZERO-BYTES-IDLE RULE. Run twice against an unchanged tree: the second run must be silent.
// A digest that speaks every turn is a permanent tax and trains the reader to skip the block.
await Bun.file(`${repo}/.claude/.digest-state-selftest.json`).delete().catch(() => {});
const firstDigest = await verdictOf("12-delta-digest", live);
check("digest is silent on its first run (records a baseline, dumps nothing)", firstDigest === null);
const secondDigest = await verdictOf("12-delta-digest", live);
check("digest is silent when NOTHING changed — zero bytes idle", secondDigest === null);

// ...and speaks when something does. Without this the silence above could just be a broken module.
const stateFile = `${repo}/.claude/.digest-state-selftest.json`;
const saved = (await Bun.file(stateFile).json()) as Record<string, string>;
await Bun.write(stateFile, JSON.stringify({ ...saved, "item:H1": "todo" }));
const changedDigest = await verdictOf("12-delta-digest", live);
check(
  "digest speaks when a status actually moved",
  changedDigest?.kind === "context" && changedDigest.text.includes("item:H1"),
);

const beacon = await verdictOf("13-stop-beacon", live);
check("stop beacon runs without throwing", beacon === null || beacon.kind === "context");
const beaconFile = await Bun.file(`${repo}/.claude/.stop-beacon.json`).json().catch(() => null);
check(
  "stop beacon wrote an observable state file",
  beaconFile !== null && typeof beaconFile.at === "string",
  "a watcher outside the session is the only thing that can tell 'finished' from 'died'",
);
check(
  "beacon records whether the seat went quiet with work still queued",
  beaconFile !== null && typeof beaconFile.silent_with_queue === "boolean",
);

// ── chain shape ───────────────────────────────────────────────────────────────────────────────
// ── 12-delta-digest watches the ENFORCEMENT plane, not just the campaign planes ────────────────
// The gap an external review caught the expensive way: the walls moved across a dozen commits and
// no delta ever fired, so every dependent seat kept trusting guards that had already changed.
const digestKeys = Object.keys(
  (await Bun.file(`${repo}/.claude/.digest-state-selftest.json`).json().catch(() => ({}))) as Record<string, unknown>,
);
for (const area of ["walls:hooks", "walls:gates", "walls:rules", "walls:corpus", "repo:HEAD"]) {
  check(`digest tracks ${area}`, digestKeys.includes(area), `keys: ${digestKeys.join(", ")}`);
}

// The WIRING, not just the wall code. Each of these moves the enforcement plane without touching
// a line of wall logic — the matcher and deny rules, whether the staged gate runs at commit time,
// the gate chain's definition, which rule directories are scanned. A legitimate granted edit to
// any of them is exactly when dependent seats most need telling, because nothing about it reads
// as a weakening in a diff.
for (const area of ["walls:wiring", "walls:githooks", "walls:chain", "walls:sgconfig"]) {
  check(`digest tracks ${area} (the wiring, not just the code)`, digestKeys.includes(area), `keys: ${digestKeys.join(", ")}`);
}

// package.json is the gate chain's root: dropping `gate:ratchet` from one &&-separated line leaves
// CI green with the load-bearing defence never invoked.
await blocks("03-grant-gate", guardedWrite("package.json"), "no grant: blocks the gate chain definition");

// THE LAST RUNG. The ratchet guards every wall, ratchet-selftest guards the ratchet, and until
// round 4 nothing guarded that pair — so one commit could neuter ratchet-3a, drop its regression
// case, and retire a wall's coverage with local AND CI both green, because CI faithfully runs the
// pushed weakened ratchet. The whole directory is guarded now: every gate here is silent when
// weakened, and grant-status.ts is worse than silent since a weakened status card actively lies
// about what is guarded.
// (compose-flow roster — book-laws.ts absent, deletion-guard/grant-path-wall/ci-hygiene present.)
for (const gate of [
  "ratchet.ts",
  "ratchet-selftest.ts",
  "cli-selftest.ts",
  "lattice.ts",
  "deletion-guard.ts",
  "grant-path-wall.ts",
  "ci-hygiene.ts",
  "hookpath.ts",
  "grant-status.ts",
  "beacon-check.ts",
]) {
  await blocks("03-grant-gate", guardedWrite(`dev/gates/${gate}`), `no grant: blocks EXISTING dev/gates/${gate}`);
}

// ADDING a gate is tightening, and tightening never needs permission. Guarding the directory
// wholesale broke this — a regression I introduced with the round-4 fix and did not notice, which
// also blocked the very remedy for the CLI-selftest hole: a new file whose entire purpose is more
// checking. The guard now distinguishes a creation from a modification.
await allows(
  "03-grant-gate",
  guardedWrite("dev/gates/some-brand-new-gate.ts"),
  "free: a NEW gate — adding a wall is tightening",
);

// …but the Gradle entries stay guarded BEFORE they exist, which is the deliberate exception. A
// blanket new-file carve-out would have silently undone that, so the carve-out is per-entry.
await blocks(
  "03-grant-gate",
  guardedWrite("settings.gradle.kts"),
  "still blocked before it exists: the module graph is guarded waiting, not retrospectively",
);

// ── 30-bash-audit: records, never speaks, never gates ─────────────────────────────────────────
const auditLog = `${repo}/.claude/.bash-audit.log`;
const savedAudit = await Bun.file(auditLog).text().catch(() => null);
await Bun.file(auditLog).delete().catch(() => {});

const auditNoisy = await verdictOf("30-bash-audit", {
  tool_name: "Bash",
  tool_input: { command: "sed -i s/a/b/ dev/gates/lattice.ts" },
  cwd: repo,
  session_id: "selftest",
});
check("bash audit is SILENT — it is a record, not a gate", auditNoisy === null);
check(
  "bash audit recorded the wall-relevant command",
  (await Bun.file(auditLog).text().catch(() => "")).includes("sed -i"),
);

await Bun.file(auditLog).delete().catch(() => {});
await verdictOf("30-bash-audit", {
  tool_name: "Bash",
  tool_input: { command: "ls -la" },
  cwd: repo,
  session_id: "selftest",
});
check(
  "bash audit ignores ordinary commands — an audit that records everything is read by nobody",
  !(await Bun.file(auditLog).exists()),
);

await Bun.file(auditLog).delete().catch(() => {});
if (savedAudit !== null) await Bun.write(auditLog, savedAudit);

// ── restore the live runtime state this suite borrowed (R4) ───────────────────────────────────
await restoreRuntimeState();
check(
  "the selftest restored the live beacon it borrowed",
  savedRuntimeState.get(`${repo}/.claude/.stop-beacon.json`) === null ||
    (await Bun.file(`${repo}/.claude/.stop-beacon.json`).text().catch(() => null)) ===
      savedRuntimeState.get(`${repo}/.claude/.stop-beacon.json`),
  "a suite that resets the aliveness signal breaks the watcher that reads it",
);

const names = registry.map((entry) => entry.name).join(",");
check(
  "chain is exactly the declared walls plus lifecycle, operator and audit modules",
  names ===
    // agent-driven-architecture roster: 01-no-python and 04-ast-grep-walls are absent — both are
    // compose-flow product laws, not machinery (dev/campaigns/setup/VENDORED.md). This literal is
    // what makes their absence DELIBERATE rather than a vendoring that quietly dropped two walls.
    "02-ledger-channel,03-grant-gate,10-law-injection,11-inflight-reanchor,12-delta-digest,13-stop-beacon,20-grant-issue,30-bash-audit",
  `got: ${names}`,
);
check(
  "chain is ordered by `order`",
  registry.every((entry, index) => index === 0 || entry.order > (registry[index - 1]?.order ?? 0)),
  `orders: ${registry.map((entry) => entry.order).join(",")}`,
);

await Bun.$`rm -rf ${sandbox}`.quiet();

console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
