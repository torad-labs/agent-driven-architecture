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

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ""): void {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`  FAIL  ${label}${detail === "" ? "" : `\n        ${detail}`}`);
}

async function verdictOf(name: string, payload: HookPayload): Promise<HookVerdict> {
  const found = registry.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`module ${name} is not registered`);
  return await found.run(payload);
}

console.log("hook selftest");

// ── 01-no-python — NOT PORTED ────────────────────────────────────────────────────────────────
// compose-flow's operator law, and its checks lived here. It did not come across (this tree's
// own enforcement layer is currently Python). Removing the module without removing its checks would
// have left the chain asserting a wall that is absent, which is the fake-green this file exists to
// prevent.

// ── 02-ledger-channel — REMOVED 2026-10-10 (operator ruling) ─────────────────────────────────────
// The ledger went with it, and so did its checks.

// ── 03-grant-gate + 20-grant-issue — DELETED 2026-08-13 ──────────────────────────────────────
// Operator ruling: "the grant system is dead." Its checks lived here; removing the modules
// without removing their checks would leave the chain asserting walls that are absent — the
// fake-green this file exists to prevent.

// ── lifecycle and audit modules ─────────────────────────────────────────────────────────────
// The digest reads the real enforcement surface, so it is driven against the REAL repo. A fixture
// would prove only that the fixture parses.
const repo = process.cwd();
const live: HookPayload = { cwd: repo, session_id: "selftest" };

// THE ZERO-BYTES-IDLE RULE. Run twice against an unchanged tree: the second run must be silent.
// A digest that speaks every turn is a permanent tax and trains the reader to skip the block.
const stateFile = `${repo}/.claude/.digest-state-selftest.json`;
await Bun.file(stateFile).delete().catch(() => {});
const firstDigest = await verdictOf("12-delta-digest", live);
check("digest is silent on its first run (records a baseline, dumps nothing)", firstDigest === null);
const secondDigest = await verdictOf("12-delta-digest", live);
check("digest is silent when NOTHING changed — zero bytes idle", secondDigest === null);

// ...and speaks when something does. Without this the silence above could just be a broken module.
const saved = (await Bun.file(stateFile).json()) as Record<string, string>;
await Bun.write(stateFile, JSON.stringify({ ...saved, "walls:hooks": "selftest-stale" }));
const changedDigest = await verdictOf("12-delta-digest", live);
check(
  "digest speaks when the enforcement surface actually moved",
  changedDigest?.kind === "context" && changedDigest.text.includes("walls:hooks"),
);

// ── chain shape ───────────────────────────────────────────────────────────────────────────────
// ── 12-delta-digest watches the ENFORCEMENT plane ─────────────────────────────────────────────
// The gap an external review caught the expensive way: the walls moved across a dozen commits and
// no delta ever fired, so every dependent seat kept trusting guards that had already changed.
const digestKeys = Object.keys(
  (await Bun.file(stateFile).json().catch(() => ({}))) as Record<string, unknown>,
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
  tool_input: { command: "sed -i s/a/b/ dev/gates/ratchet.ts" },
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

// The digest baseline this suite wrote is the suite's own (session "selftest"), not a seat's.
await Bun.file(stateFile).delete().catch(() => {});

const names = registry.map((entry) => entry.name).join(",");
check(
  "chain is exactly the declared walls plus lifecycle and audit modules",
  names ===
    // agent-driven-architecture roster: 01-no-python and 04-ast-grep-walls never came across,
    // 03-grant-gate/20-grant-issue were deleted 2026-08-13 (operator ruling), and the ledger channel,
    // the in-flight re-anchor and the stop beacon went with the ledger on 2026-10-10 (operator
    // ruling). This literal is what keeps each absence DELIBERATE rather than a chain that quietly
    // lost links.
    "12-delta-digest,30-bash-audit",
  `got: ${names}`,
);
check(
  "chain is ordered by `order`",
  registry.every((entry, index) => index === 0 || entry.order > (registry[index - 1]?.order ?? 0)),
  `orders: ${registry.map((entry) => entry.order).join(",")}`,
);

console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
