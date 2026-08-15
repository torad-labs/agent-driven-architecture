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

// ── 03-grant-gate + 20-grant-issue — DELETED 2026-08-13 ──────────────────────────────────────
// Operator ruling: "the grant system is dead." Its checks lived here; removing the modules
// without removing their checks would leave the chain asserting walls that are absent — the
// fake-green this file exists to prevent. The ruling, the blast radius, and what replaced the
// enforcement model are recorded in dev/campaigns/setup/VENDORED.md.

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
// the gate chain's definition, which rule directories are scanned. A legitimate edit to any of
// them is exactly when dependent seats most need telling, because nothing about it reads
// as a weakening in a diff.
for (const area of ["walls:wiring", "walls:githooks", "walls:chain", "walls:sgconfig"]) {
  check(`digest tracks ${area} (the wiring, not just the code)`, digestKeys.includes(area), `keys: ${digestKeys.join(", ")}`);
}

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
  "chain is exactly the declared walls plus lifecycle and audit modules",
  names ===
    // agent-driven-architecture roster: 01-no-python and 04-ast-grep-walls never came across, and
    // 03-grant-gate/20-grant-issue were deleted 2026-08-13 (operator ruling) — all four absences
    // are recorded in dev/campaigns/setup/VENDORED.md. This literal is what keeps them DELIBERATE
    // rather than a chain that quietly lost links.
    "02-ledger-channel,10-law-injection,11-inflight-reanchor,12-delta-digest,13-stop-beacon,30-bash-audit",
  `got: ${names}`,
);
check(
  "chain is ordered by `order`",
  registry.every((entry, index) => index === 0 || entry.order > (registry[index - 1]?.order ?? 0)),
  `orders: ${registry.map((entry) => entry.order).join(",")}`,
);

console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
