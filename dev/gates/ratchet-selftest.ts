#!/usr/bin/env bun
/**
 * RATCHET SELFTEST — proves the ratchet's own three clauses against synthetic corpus mutations.
 *
 * The ratchet guards every wall. Nothing guarded the ratchet, and that gap was not theoretical:
 * ratchet-3 shipped enforcing two of the three clauses it documented in its own header. It walked
 * CURRENT entries looking each up in the baseline, so a DELETED id was never examined — and paired
 * with a same-commit addition it went green while retiring a wall's coverage.
 *
 * Each case below mutates a corpus in /tmp and asserts the verdict. The tree is never touched.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

// PROBE WALL (2026-10-12). These fixtures used to name 02-ledger-channel over ledger paths. That wall
// went with the ledger, and the TypeScript chain has no refusing wall left, so the probe corpus now
// names a wall the sandbox installs for itself (see below). The ratchet does not care WHICH wall a
// fixture names, only that the named wall is registered and still refuses. Each entry needs a
// DISTINCT path.
const BASE = `# probe corpus
[[violations]]
id = "A"
wall = "99-selftest-probe"
path = "probe/A.toml"
content = "status = \\"verified\\"\\n"
why = "a"

[[violations]]
id = "B"
wall = "99-selftest-probe"
path = "probe/B.toml"
content = "status = \\"verified\\"\\n"
why = "b"
`;

let failures = 0;
let checks = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  FAIL  ${label}${detail === "" ? "" : `\n        ${detail}`}`);
};

const repo = (await Bun.$`git rev-parse --show-toplevel`.quiet().text()).trim();
const dir = mkdtempSync(`${tmpdir()}/ratchet-selftest-`);

// The sandbox is a FULL tracked-file copy, built once. The hook modules import across the tree —
// ratchet.ts reaches registry.ts and types.ts — so a hand-assembled partial repo fails for reasons
// that have nothing to do with the ratchet, which is exactly the kind of false red that gets a
// selftest deleted rather than fixed.
await Bun.$`git init -q ${dir}`.quiet().nothrow();
await Bun.$`sh -c ${`cd '${repo}' && git ls-files -z | tar --null -T - -cf - | tar xf - -C '${dir}'`}`
  .quiet()
  .nothrow();
await Bun.$`mkdir -p ${dir}/dev/walls`.quiet();

// THE PROBE WALL. The TypeScript chain has no refusing wall once the ledger wall is gone, and the
// ratchet's clauses cannot be exercised without one. So the sandbox, and only the sandbox, gets a
// test-only wall that refuses writes under probe/, and a registry that holds nothing else. Nothing
// written here reaches the real chain.
const PROBE_WALL = "99-selftest-probe";
writeFileSync(
  `${dir}/.claude/hooks/modules/${PROBE_WALL}.ts`,
  `import type { HookModule, HookPayload, HookVerdict } from "../types.ts";

export const module: HookModule = {
  order: 1,
  name: "${PROBE_WALL}",
  events: ["PreToolUse"],
  staged: "write-time-only",
  run(payload: HookPayload): HookVerdict {
    const path = String(payload.tool_input?.["file_path"] ?? "");
    return /(^|\\/)probe\\/[^/]+$/.test(path) ? { kind: "block", reason: "selftest probe" } : null;
  },
};

export default module;
`,
);
writeFileSync(
  `${dir}/.claude/hooks/registry.ts`,
  `import probe from "./modules/${PROBE_WALL}.ts";
import type { HookModule } from "./types.ts";

export const registry: readonly HookModule[] = [probe];
`,
);

async function verdict(
  corpus: string,
  baseline: string = BASE,
  env: Record<string, string> = {},
): Promise<{ exit: number; out: string }> {
  // Re-establish the baseline commit, then mutate the worktree. The ratchet compares worktree
  // against `git show HEAD:` outside CI, which is the comparison under test here.
  writeFileSync(`${dir}/dev/walls/corpus.toml`, baseline);
  await Bun.$`git -C ${dir} add -A`.quiet().nothrow();
  await Bun.$`git -C ${dir} -c user.name=t -c user.email=t@t commit -q --allow-empty -m base`
    .quiet()
    .nothrow();

  writeFileSync(`${dir}/dev/walls/corpus.toml`, corpus);
  const proc = Bun.spawn(["bun", `${dir}/dev/gates/ratchet.ts`], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  return { exit: await proc.exited, out };
}

console.log("ratchet selftest");

// THE CI BASELINE ORACLE — must run FIRST, while the sandbox has a single commit and HEAD~1 does
// not resolve. A garbage push base plus an unresolvable fallback is the shallow-checkout failure:
// before the fix, the baseline read as an empty string and ratchets 2/3/3a silently examined
// nothing while printing success.
const ciUnresolvable = await verdict(BASE, BASE, {
  CI: "true",
  GITHUB_EVENT_BEFORE: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
});
check(
  "an unresolvable CI baseline fails closed (exit 2, loud)",
  ciUnresolvable.exit === 2 && /CANNOT RESOLVE/.test(ciUnresolvable.out),
  ciUnresolvable.out.slice(0, 300),
);

const unchanged = await verdict(BASE);
check("unchanged corpus passes", unchanged.exit === 0, unchanged.out.slice(0, 200));

// ratchet-2: pure shrinkage.
const shrunk = await verdict(BASE.split("[[violations]]").slice(0, 2).join("[[violations]]"));
check("a pure deletion is caught", shrunk.exit === 1 && /SHRANK|DELETED/.test(shrunk.out));

// ratchet-3: retarget at the same cardinality.
const retargeted = await verdict(BASE.replace('path = "probe/B.toml"', 'path = "probe/C.toml"'));
check("a retarget at the same count is caught", retargeted.exit === 1 && /RETARGETED/.test(retargeted.out));

// ratchet-3a: THE ROUND-3 HOLE — delete one, add another, count unchanged.
const swapped = await verdict(
  BASE.replace(/\[\[violations\]\]\nid = "B"[\s\S]*$/, '[[violations]]\nid = "C"\nwall = "99-selftest-probe"\npath = "probe/C.toml"\ncontent = "level = \\"x\\"\\n"\nwhy = "c"\n'),
);
check(
  "delete+add at the same count is caught (the round-3 hole)",
  swapped.exit === 1 && /DELETED/.test(swapped.out),
  swapped.out.slice(0, 300),
);

// Additions alone must stay legal, or the ratchet blocks its own maintenance.
const grown = await verdict(`${BASE}\n[[violations]]\nid = "D"\nwall = "99-selftest-probe"\npath = "probe/C.toml"\ncontent = "level = \\"x\\"\\n"\nwhy = "d"\n`);
check("a pure addition is allowed", grown.exit === 0, grown.out.slice(0, 200));

/**
 * RETIRED — the only legal way for the corpus to shrink. A wall retirement is an operator ruling
 * recorded as data: the id leaves `violations` and lands in `retired` with the ruling beside it.
 * Anything else — an unnamed deletion, a mislabelled retirement, a "retired" id that is still
 * present, a retirement of nothing — is a weakening wearing a retirement's clothes and fails.
 */
const MINUS_B = BASE.split("[[violations]]").slice(0, 2).join("[[violations]]");
const withRetired = (corpus: string, retired: string): string =>
  corpus.replace("[[violations]]", `${retired}\n\n[[violations]]`);

const retiredOk = await verdict(
  withRetired(MINUS_B, 'retired = [ { id = "B", wall = "99-selftest-probe" } ]'),
);
check("a deletion recorded as retired passes", retiredOk.exit === 0, retiredOk.out.slice(0, 300));

const retiredWrongWall = await verdict(
  withRetired(MINUS_B, 'retired = [ { id = "B", wall = "01-no-python" } ]'),
);
check(
  "a retired entry naming the wrong wall fails",
  retiredWrongWall.exit === 1 && /belonged to/.test(retiredWrongWall.out),
  retiredWrongWall.out.slice(0, 300),
);

const retiredStillPresent = await verdict(
  withRetired(BASE, 'retired = [ { id = "B", wall = "99-selftest-probe" } ]'),
);
check(
  "a retired id still present in the corpus fails",
  retiredStillPresent.exit === 1 && /still present/.test(retiredStillPresent.out),
  retiredStillPresent.out.slice(0, 300),
);

const retiredUnknown = await verdict(
  withRetired(BASE, 'retired = [ { id = "ZZZ", wall = "99-selftest-probe" } ]'),
);
check(
  "a retired entry that retires nothing fails",
  retiredUnknown.exit === 1 && /names nothing/.test(retiredUnknown.out),
  retiredUnknown.out.slice(0, 300),
);

const RETIRED_B = 'retired = [ { id = "B", wall = "99-selftest-probe" } ]';
const steadyBaseline = withRetired(MINUS_B, RETIRED_B);
const steady = await verdict(steadyBaseline, steadyBaseline);
check(
  "a COMMITTED retirement stays green — the steady state must not punish its own record",
  steady.exit === 0,
  steady.out.slice(0, 300),
);

const droppedRecord = await verdict(MINUS_B, steadyBaseline);
check(
  "dropping a retired id from the record fails — the list is history, not a scratch pad",
  droppedRecord.exit === 1 && /gone from the record/.test(droppedRecord.out),
  droppedRecord.out.slice(0, 300),
);

rmSync(dir, { recursive: true, force: true });
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
