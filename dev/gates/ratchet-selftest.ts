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
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { writeTokenFixture } from "../../.claude/hooks/grant-store.ts";

// PORT NOTE (2026-08-07). Upstream these fixtures used 01-no-python with `.py` paths. That wall
// did not come across — see dev/campaigns/setup/VENDORED.md — so the probe corpus is expressed
// against 02-ledger-channel instead. The ratchet does not care WHICH wall a fixture names, only
// that the named wall is in the registry and still refuses; picking a vendored one is the whole
// substitution. Each entry needs a DISTINCT guarded path, and the ledger channel guards three.
const BASE = `# probe corpus
[[violations]]
id = "A"
wall = "02-ledger-channel"
path = "dev/campaigns/sdk.toml"
content = "status = \\"verified\\"\\n"
why = "a"

[[violations]]
id = "B"
wall = "02-ledger-channel"
path = "dev/matrix.toml"
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
// 02-ledger-channel reaches .claude/hooks/repo.ts — so a hand-assembled partial repo fails for reasons
// that have nothing to do with the ratchet, which is exactly the kind of false red that gets a
// selftest deleted rather than fixed.
await Bun.$`git init -q ${dir}`.quiet().nothrow();
await Bun.$`sh -c ${`cd '${repo}' && git ls-files -z | tar --null -T - -cf - | tar xf - -C '${dir}'`}`
  .quiet()
  .nothrow();
await Bun.$`mkdir -p ${dir}/dev/walls`.quiet();

async function verdict(corpus: string): Promise<{ exit: number; out: string }> {
  // Re-establish the baseline commit, then mutate the worktree. The ratchet compares worktree
  // against `git show HEAD:` outside CI, which is the comparison under test here.
  writeFileSync(`${dir}/dev/walls/corpus.toml`, BASE);
  await Bun.$`git -C ${dir} add -A`.quiet().nothrow();
  await Bun.$`git -C ${dir} -c user.name=t -c user.email=t@t commit -q --allow-empty -m base`
    .quiet()
    .nothrow();

  writeFileSync(`${dir}/dev/walls/corpus.toml`, corpus);
  const proc = Bun.spawn(["bun", `${dir}/dev/gates/ratchet.ts`], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  return { exit: await proc.exited, out };
}

console.log("ratchet selftest");

const unchanged = await verdict(BASE);
check("unchanged corpus passes", unchanged.exit === 0, unchanged.out.slice(0, 200));

// ratchet-2: pure shrinkage.
const shrunk = await verdict(BASE.split("[[violations]]").slice(0, 2).join("[[violations]]"));
check("a pure deletion is caught", shrunk.exit === 1 && /SHRANK|DELETED/.test(shrunk.out));

// ratchet-3: retarget at the same cardinality.
const retargeted = await verdict(BASE.replace('path = "dev/matrix.toml"', 'path = "dev/manifests/agent-driven-architecture.toml"'));
check("a retarget at the same count is caught", retargeted.exit === 1 && /RETARGETED/.test(retargeted.out));

// ratchet-3a: THE ROUND-3 HOLE — delete one, add another, count unchanged.
const swapped = await verdict(
  BASE.replace(/\[\[violations\]\]\nid = "B"[\s\S]*$/, '[[violations]]\nid = "C"\nwall = "02-ledger-channel"\npath = "dev/manifests/agent-driven-architecture.toml"\ncontent = "level = \\"x\\"\\n"\nwhy = "c"\n'),
);
check(
  "delete+add at the same count is caught (the round-3 hole)",
  swapped.exit === 1 && /DELETED/.test(swapped.out),
  swapped.out.slice(0, 300),
);

// Additions alone must stay legal, or the ratchet blocks its own maintenance.
const grown = await verdict(`${BASE}\n[[violations]]\nid = "D"\nwall = "02-ledger-channel"\npath = "dev/manifests/agent-driven-architecture.toml"\ncontent = "level = \\"x\\"\\n"\nwhy = "d"\n`);
check("a pure addition is allowed", grown.exit === 0, grown.out.slice(0, 200));

/**
 * N21 — THE RATCHET MUST ASK `liveGrant`, NOT "does a token file exist".
 *
 * It asked the wrong question for ten rounds. `revoke()` deletes the token; expiry does not, so an
 * expired grant left a dead file that blocked the load-bearing gate forever. It failed safe and
 * the token is gitignored, so CI never saw it — but the grant documents itself as a "bounded,
 * self-closing door" and it did not self-close for this one gate.
 *
 * PREMISE FIRST, because the failure mode here is a case that passes for the wrong reason: assert
 * the token FILE IS PRESENT in the expired case. Without that, "expired does not block" would also
 * pass if the fixture simply never wrote the file, which is the exact bug class the sandbox
 * fixtures have produced five times across these rounds.
 */
// The token path is owned by grant-store.ts and named nowhere else (N22) — hardcoding it here is
// what put it in three files and re-opened the escape by the back door. `writeTokenFixture` exists
// because `issue()` clamps on write and therefore cannot produce the expired token this needs.
let tokenPath = "";
const writeToken = async (expiresAt: string): Promise<void> => {
  mkdirSync(`${dir}/.claude`, { recursive: true });
  tokenPath = await writeTokenFixture(dir, {
    expiresAt,
    reason: "selftest",
    grantedBy: "selftest",
    sessionId: "selftest",
  });
};

await writeToken(new Date(Date.now() + 10 * 60_000).toISOString());
const withLive = await verdict(BASE);
// Flipped 2026-08-02 (operator ruling): the ratchet measures the resting state HERMETICALLY
// (GRANT_STORE_ASSUME_REST), so a live grant neither blocks the run nor opens the walls it
// measures — the corpus must still be fully refused underneath an open window.
check(
  "a LIVE grant does NOT block the ratchet, and the walls still refuse under it",
  withLive.exit === 0 && /all refused/.test(withLive.out),
  withLive.out.slice(0, 300),
);

await writeToken(new Date(Date.now() - 60_000).toISOString());
check("the expired token file is actually present (the premise)", existsSync(tokenPath));
const withExpired = await verdict(BASE);
check("an EXPIRED grant does NOT block the ratchet (N21)", withExpired.exit === 0, withExpired.out.slice(0, 300));

// A hand-edited expiry beyond the clamp is not a grant either — liveGrant rejects it, so the
// ratchet must run rather than treat it as an open door it should stand down for.
await writeToken(new Date(Date.now() + 365 * 24 * 3_600_000).toISOString());
const withClamped = await verdict(BASE);
check("an expiry past the clamp does not block either", withClamped.exit === 0, withClamped.out.slice(0, 300));

rmSync(tokenPath, { force: true });

rmSync(dir, { recursive: true, force: true });
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
