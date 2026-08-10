#!/usr/bin/env bun
/**
 * EXTERNAL WITNESS for the ledger and matrix CLIs — and it now actually covers both.
 *
 * Both carry their own `selftest` subcommand, which means weakening a check AND editing the test
 * that would have caught it is ONE coherent commit with no outside observer. The corpus catches
 * wall behaviour; it cannot catch a ledger CLI that quietly stops preserving comments — and
 * comment preservation is the property the entire memory model rests on.
 *
 * This file is that observer, and it lives in the guarded gates directory so it inherits the same
 * protection `ratchet-selftest.ts` gave the ratchet. It deliberately does NOT call the CLIs'
 * built-in selftests: re-running the test a file ships with proves only that the file agrees with
 * itself. It asserts the load-bearing PROPERTIES directly, against a throwaway ledger in /tmp.
 *
 * Only the properties whose loss would be silent. This is not a second test suite.
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { liveGrant } from "../../.claude/hooks/grant-store.ts";

let failures = 0;
let checks = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  FAIL  ${label}${detail === "" ? "" : `\n        ${detail}`}`);
};

const repo = (await Bun.$`git rev-parse --show-toplevel`.quiet().text()).trim();
const dir = mkdtempSync(`${tmpdir()}/cli-witness-`);
const ledgerPath = `${dir}/probe.toml`;

const LEDGER = `# probe ledger
# LAW: a-law-that-must-survive — the header is the campaign's memory
[[items]]
id = "P1"
phase = "p"
title = "an item"
files = []
status = "todo"
verify = "v"
# 2026-07-27 a pre-existing note that must survive every write
`;

async function ledger(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", `${repo}/dev/campaigns/ledger.ts`, ledgerPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LEDGER_ORCHESTRATOR: "" },
  });
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  await proc.exited;
  return out;
}

console.log("cli witness");

writeFileSync(ledgerPath, LEDGER);

// THE property. A TOML serializer round-trip would eat both of these, the file would still parse,
// and every other check in the repository would stay green while the memory was gone.
await ledger("set-status", "P1", "in_flight");
await ledger("note", "P1", "a note written by the witness");
const after = readFileSync(ledgerPath, "utf8");
check("header laws survive a write", after.includes("# LAW: a-law-that-must-survive"));
check("pre-existing item notes survive a write", after.includes("must survive every write"));
check("the new note landed", after.includes("a note written by the witness"));
check("the status actually changed", after.includes('status = "in_flight"'));

/**
 * A FAILED MUTATION rolls back — not a failed read.
 *
 * The first version of this check used `get NOPE`, which is a READ. It proved that reads do not
 * write, which nothing was in doubt about, while claiming to prove that `mutate`'s
 * validate-before-write leaves the file untouched on failure.
 *
 * `note NOPE "…"` throws INSIDE the transform, inside `mutate`, after the lock is taken — which is
 * the path that actually has to leave the file byte-identical.
 *
 * Fourth instance across six rounds of an assertion passing for a reason unrelated to the property
 * it names, and this one was written in the same commit where I predicted the failure mode. It is
 * the argument for external witnesses over co-located tests: external fixtures get read, internal
 * ones get believed.
 */
const before = readFileSync(ledgerPath, "utf8");
const failedMutation = await ledger("note", "NOPE", "this item does not exist");
check("a failed MUTATION is reported, not silently ignored", failedMutation.includes("no item with id"));
check(
  "a failed mutation leaves the file byte-identical (validate-before-write)",
  readFileSync(ledgerPath, "utf8") === before,
);
// And no lock is left behind — a wedged lock would deny every later write for STALE_LOCK_MS.
check("the failed mutation released its lock", !existsSync(`${ledgerPath}.lock`));

// The authority rule, from outside the file that implements it.
check(
  "a builder cannot set verified",
  (await ledger("set-status", "P1", "verified")).includes("orchestrator's word"),
);

// The amend channel: grant-gated, and every use must preserve the old value as a dated note.
// Both branches exercise the real path; which one runs depends on the actual grant state — a
// verdict hardcoded against one state is not a test (the add-law lesson, from the ledger's own
// selftest).
const grantOpen = (await liveGrant(repo)) !== null;
const beforeAmend = readFileSync(ledgerPath, "utf8");
const amendOut = await ledger("amend", "P1", "--verify", "a witness verify");
if (grantOpen) {
  const afterAmend = readFileSync(ledgerPath, "utf8");
  check("amend (grant live) replaced the field", afterAmend.includes('verify = "a witness verify"'));
  check("amend preserved the old value as a dated note", afterAmend.includes("verify was"));
  check("amend preserved unrelated notes", afterAmend.includes("must survive every write"));
} else {
  check("amend without a grant is refused", amendOut.includes("needs a grant"));
  check("the refused amend left the file byte-identical", readFileSync(ledgerPath, "utf8") === beforeAmend);
}

// Keyed retrieval is the token law: `get` must not dump the whole file.
const got = await ledger("get", "P1");
check("get returns the item, not the file", got.includes("an item") && !got.includes("a-law-that-must-survive"));

// ── THE MATRIX CLI ─────────────────────────────────────────────────────────────────────────────
// This file's header claimed "ledger AND matrix" from the day it was written, and covered only the
// ledger — the word `matrix` appeared nowhere but that sentence. The matrix's identical hole
// (weaken matrix.ts and its internal selftest in one commit, no outside observer) stayed open
// while the commit message said it was closed. That is honesty-as-control-flow applied to the
// harness's own newest file, which is exactly where it should apply hardest.

const matrixPath = `${dir}/probe-matrix.toml`;

const MATRIX = `# probe matrix
[[rows]]
id = "R1"
layer = "l"
descriptor = "a row"
status = "todo"
host_proof = ""
target_proof = ""
# 2026-07-27 a row note that must survive
`;

async function matrix(...args: string[]): Promise<string> {
  const env = { ...process.env };
  delete env["MATRIX_ORCHESTRATOR"]; // the builder's view, so the authority rule is exercised
  const proc = Bun.spawn(["bun", `${repo}/dev/matrix.ts`, matrixPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  await proc.exited;
  return out;
}

writeFileSync(matrixPath, MATRIX);

// Comment survival, same property as the ledger and the same silent loss if a serializer creeps in.
await matrix("set", "R1", "in_flight");
check("matrix row notes survive a write", readFileSync(matrixPath, "utf8").includes("must survive"));

// Fail-closed: a status may not outrun its proof.
check("ready is refused with no host proof", (await matrix("set", "R1", "ready")).includes("cannot become"));

// The proof validator, from outside the file that implements it.
check("a junk proof pointer is refused", (await matrix("prove", "R1", "--host", "ok")).includes("too short"));
check(
  "an unresolvable pointer is refused",
  (await matrix("prove", "R1", "--host", "it works I promise honestly")).includes("does not resolve"),
);
await matrix("prove", "R1", "--host", "bun run gate green @ 78f5051");
check("a resolvable pointer is accepted", (await matrix("get", "R1")).includes("78f5051"));

// The authority rule — this helper deliberately runs WITHOUT MATRIX_ORCHESTRATOR.
await matrix("prove", "R1", "--target", "device receipt sha256:deadbeef42 2026-07-27");
check(
  "a builder cannot set verified",
  (await matrix("set", "R1", "verified")).includes("orchestrator's word"),
);

// Same checker twice: validate must re-run the proof validator, not just check emptiness.
writeFileSync(matrixPath, MATRIX.replace('status = "todo"', 'status = "ready"').replace('host_proof = ""', 'host_proof = "ok"'));
check("validate re-runs the proof validator on a hand-edited row", (await matrix("validate")).includes("too short"));


// earned-row v2 (matrix)
await matrix("check", "R1", "unit", "--cmd", "true");
check(
  "set-proof refuses executed slug",
  (await matrix("set-proof", "R1", "unit", "bun run gate green @ abcdef12")).includes("refused"),
);
check("earn unit", (await matrix("earn", "R1", "unit")).includes("exit=0"));
await matrix("require", "R1", "ready", "unit");
check(
  "block without evidence refused via set",
  (await matrix("set", "R1", "blocked")).toLowerCase().includes("block"),
);

// review protocol selftest is separate file; witness that the binary exists
check(
  "hydrate.ts selftest",
  (await Bun.spawn(["bun", `${repo}/dev/campaigns/hydrate.ts`, "selftest"], { stdout: "pipe", stderr: "pipe" }).exited) === 0,
);
check(
  "review.ts is loadable",
  (await Bun.spawn(["bun", `${repo}/dev/campaigns/review.ts`, "selftest"], { stdout: "pipe", stderr: "pipe" }).exited) === 0,
);

rmSync(dir, { recursive: true, force: true });
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
