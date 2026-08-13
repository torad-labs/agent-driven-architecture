#!/usr/bin/env bun
/**
 * DELETION IS THE OPERATION NO OTHER CHECK COULD SEE.
 *
 * Seven review rounds narrowed the harness to exactly one blind operation class, and this closes
 * it. Every channel was individually honest and the chain was not:
 *
 *   PreToolUse    write tools cannot delete, so a `git rm` never reaches it
 *   staged.ts     `--diff-filter=ACMR` excludes D — deliberately, because "a deletion cannot
 *                 violate a wall". True of walls. False of GATES: deleting one removes a check.
 *   the corpus    its payloads run against an intact tree, so a missing gate is invisible to it
 *   the HEAD      truthfully reports that HEAD no longer knows the path — after the deletion is
 *   oracle        committed, a Write recreating it weakened is a genuine "creation", and free
 *
 * Proven end to end: `git rm dev/gates/ratchet.ts && git commit` printed `nothing staged`; the
 * subsequent Write of a weakened ratchet went free; the recreation passed the staged gate. Green
 * everywhere, with the load-bearing checker silently retired.
 *
 * WHY A SEPARATE GATE rather than a branch inside staged.ts: that gate re-runs the write-time
 * CONTENT walls against staged blobs, and a deletion has no blob. Its `staged` scope model
 * (recheck vs write-time-only) has nothing to say about a path that is going away. Two concerns,
 * two files.
 *
 *   bun dev/gates/deletion-guard.ts              # pre-commit: the index
 *   bun dev/gates/deletion-guard.ts --range A..B # CI backstop: a pushed range
 *   bun dev/gates/deletion-guard.ts --selftest
 *
 * A guarded deletion is not forbidden — it is GATED, exactly like a guarded modification. Retiring
 * a gate is a real thing to want; doing it silently is not.
 */
import { isLoadBearing, liveGrant } from "../../.claude/hooks/grant-store.ts";

const argv = Bun.argv.slice(2);
if (argv.includes("--selftest")) {
  await selftest();
  process.exit(0);
}

const root = (await Bun.$`git rev-parse --show-toplevel`.quiet().nothrow().text()).trim() || ".";
const rangeIndex = argv.indexOf("--range");
const requestedRange = rangeIndex === -1 ? null : (argv[rangeIndex + 1] ?? "");
if (requestedRange === "") {
  console.error("deletion guard: --range wants A..B");
  process.exit(2);
}

// `resolveRange` and `deletionsIn` are `function` declarations, so the hoisting is real. N17
// deadlocked the tool path by referencing a `const` arrow before its definition, and the
// fail-closed runner then refused the repair itself — cheap to get right, expensive to recover.
const range = requestedRange === null ? null : await resolveRange(root, requestedRange);
// A null range from a non-null request means a root commit: nothing precedes it to delete.
const deleted =
  requestedRange !== null && range === null ? [] : await deletionsIn(root, range);
const guarded = deleted.filter((path) => isLoadBearing(path, true));

if (guarded.length === 0) {
  console.log(
    `deletion guard: clean · ${deleted.length} deletion(s), none guarded${range === null ? "" : ` (${range})`}`,
  );
  process.exit(0);
}

// A live grant authorises a guarded deletion the same way it authorises a guarded modification.
if ((await liveGrant(root)) !== null) {
  console.log(`deletion guard: ${guarded.length} guarded deletion(s), permitted by a live grant`);
  for (const path of guarded) console.log(`  ${path}`);
  process.exit(0);
}

console.error(`deletion guard: ${guarded.length} guarded path(s) being DELETED\n`);
for (const path of guarded) console.error(`  ${path}`);
console.error(
  `\nDeleting a guarded path removes a check, and until now nothing anywhere observed it:\n` +
    `the write-time walls never see a deletion, the staged gate filters D out by design, and the\n` +
    `corpus runs against an intact tree. Once the deletion is committed the path is absent from\n` +
    `HEAD, so re-creating it — weakened — reads as an ordinary new file and goes free.\n\n` +
    `Retiring a gate is legitimate. Doing it silently is not. Ask the operator for a grant.`,
);
process.exit(1);

/**
 * Deletions in the index, or across a commit range when CI passes one.
 *
 * THE RANGE FORM WALKS COMMITS, IT DOES NOT DIFF ENDPOINTS.
 *
 * `git diff A..B --diff-filter=D` compares two trees, so a path deleted in commit 1 and recreated
 * in commit 2 exists at both ends and the deletion never appears. Proven: a granted deletion of
 * `ratchet.ts` followed by a weakened recreation reported `clean · 0 deletion(s)` across the range
 * containing both.
 *
 * Scope this honestly. The pre-commit DOOR catches that attack every time — the deletion is in the
 * index at commit 1. The blind spot only matters for the population the backstop exists for:
 * commits from another machine, `--no-verify`, a web-UI edit, a detached hooksPath. Against
 * exactly that population, a weakened gate would have landed CI-green, because the pushed checkers
 * self-agree and nothing else examines gate content across the range.
 *
 * So: any commit in the range that EVER deletes a guarded path trips the guard, regardless of what
 * later commits put back. What matters is that the path went away at all, because that is the
 * moment the HEAD oracle forgets it and a recreation becomes an ordinary "creation".
 *
 * AND IT PASSES `-m --first-parent`, BECAUSE A MERGE IS A COMMIT TOO.
 *
 * `git diff-tree -r` prints NOTHING for a merge commit by default — no combined diff unless asked.
 * So a guarded path deleted as MERGE RESOLUTION is present in the merge's tree, present in no
 * non-merge commit, and walked straight past. Proven: a two-parent merge dropping `ratchet.ts` in
 * its resolution reported `clean · 0 deletion(s)`; with `-m --first-parent` the same range names
 * the file. `--first-parent` is also the right question for a backstop — "what did this merge do
 * to the mainline" — rather than an incidental flag that happens to make output appear.
 *
 * Note the deliberate asymmetry: `rev-list` is NOT --first-parent. It must list side-branch
 * commits too, so a deletion committed on a branch trips the guard even if the merge restored the
 * file. Both halves fail toward noticing.
 */
async function deletionsIn(repoRoot: string, commitRange: string | null): Promise<string[]> {
  // -z everywhere, for the same reason the staged gate needs it: core.quotePath mangles non-ASCII
  // paths, and a quoted path silently fails every subsequent match.
  if (commitRange === null) {
    const out = await Bun.$`git -C ${repoRoot} diff --cached --name-only -z --diff-filter=D`
      .quiet()
      .nothrow()
      .text();
    return out.split("\0").filter((path) => path !== "");
  }

  const revs = (await Bun.$`git -C ${repoRoot} rev-list ${commitRange}`.quiet().nothrow().text())
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const deletions = new Set<string>();
  for (const rev of revs) {
    const out =
      await Bun.$`git -C ${repoRoot} diff-tree --no-commit-id -r -m --first-parent --name-only -z --diff-filter=D ${rev}`
        .quiet()
        .nothrow()
        .text();
    for (const path of out.split("\0")) {
      if (path !== "") deletions.add(path);
    }
  }
  return [...deletions];
}

/**
 * A RANGE THE ORACLE CANNOT RESOLVE IS NOT A CLEAN RANGE.
 *
 * `rev-list` on a bad range — the null sha GitHub sends as `event.before` on a branch's first
 * push, a force-push naming a commit this shallow checkout lacks, a typo'd base — fails, `nothrow`
 * swallows it, the empty result walks zero commits and the guard prints `clean`. Silent, and
 * indistinguishable from a range that genuinely deleted nothing.
 *
 * The ratchet already answers this exact question (resolveBaseline: verify with `rev-parse
 * --verify`, fall back to HEAD~1). Two backstops disagreeing about what "the oracle cannot answer"
 * means is the drift this harness exists to prevent, so this mirrors it rather than inventing a
 * third answer — with one addition the ratchet does not need: the fallback PRINTS. A silent
 * fallback is how a range check quietly stops covering the range someone believes it covers.
 *
 * Unresolvable even after the fallback is a HARD failure (exit 2, not 1). Exit 1 means "a guarded
 * deletion was found"; this is "the question could not be asked", and a backstop that cannot ask
 * its question must not report clean.
 */
async function resolveRange(repoRoot: string, requested: string): Promise<string | null> {
  const resolves = async (range: string): Promise<boolean> =>
    (await Bun.$`git -C ${repoRoot} rev-list ${range}`.quiet().nothrow()).exitCode === 0;

  if (await resolves(requested)) return requested;

  // Salvage the head, replace the base. `A..B` -> `HEAD~1..B`.
  const head = requested.includes("..") ? requested.slice(requested.lastIndexOf("..") + 2) : "HEAD";
  const fallback = `HEAD~1..${head === "" ? "HEAD" : head}`;
  if (await resolves(fallback)) {
    console.warn(
      `deletion guard: range ${JSON.stringify(requested)} does not resolve in this checkout\n` +
        `  (null sha on a first push, a force-push base this clone lacks, or a typo).\n` +
        `  Falling back to ${fallback}, which covers the last commit ONLY — anything deleted\n` +
        `  earlier in this push is NOT examined by this run.`,
    );
    return fallback;
  }

  // A root commit has no parent and cannot have deleted anything. That is honest coverage, not a
  // hole, and it is the one case where "nothing to walk" is the true answer.
  const isRoot =
    (await Bun.$`git -C ${repoRoot} rev-parse --verify --quiet HEAD^`.quiet().nothrow()).exitCode !== 0;
  if (isRoot) {
    console.log("deletion guard: HEAD is a root commit — nothing precedes it, nothing to delete");
    return null;
  }

  console.error(
    `deletion guard: CANNOT RESOLVE ${JSON.stringify(requested)}, and neither can it fall back.\n\n` +
      `  This is not a clean result. The guard was asked to examine a range and could not, which\n` +
      `  means no statement has been made about whether a guarded gate was deleted in it. Reporting\n` +
      `  clean here is exactly the silent pass this gate exists to refuse.\n\n` +
      `  Usually a shallow clone: give the checkout fetch-depth 0 so the base commit exists.`,
  );
  process.exit(2);
}

async function selftest(): Promise<void> {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  let failures = 0;
  let checks = 0;
  const check = (label: string, ok: boolean): void => {
    checks += 1;
    if (ok) return;
    failures += 1;
    console.error(`  FAIL  ${label}`);
  };

  const here = (await Bun.$`git rev-parse --show-toplevel`.quiet().text()).trim();
  const dir = mkdtempSync(`${tmpdir()}/deletion-guard-`);

  // The throwaway-repo model, because git-state preconditions are the whole point and cannot be
  // expressed against an intact tree.
  await Bun.$`git init -q ${dir}`.quiet().nothrow();
  await Bun.$`sh -c ${`cd '${here}' && git ls-files -z | tar --null -T - -cf - | tar xf - -C '${dir}'`}`
    .quiet()
    .nothrow();

  /**
   * `git ls-files` copies TRACKED files, and this gate is untracked the first time it runs. The
   * sandbox then had no deletion-guard.ts, bun exited non-zero on the missing file, and the two
   * "must be refused" checks passed on that exit code rather than on the guard's verdict — while
   * the three "must pass" checks failed and made the bug visible.
   *
   * Fifth instance of this shape across seven rounds, and the first where it manufactured a FALSE
   * PASS rather than a false failure. Copy the worktree gates over the tracked snapshot so the
   * sandbox runs the code under test, not last commit's.
   */
  await Bun.$`sh -c ${`cp '${here}'/dev/gates/*.ts '${dir}'/dev/gates/`}`.quiet().nothrow();

  await Bun.$`git -C ${dir} add -A`.quiet().nothrow();
  await Bun.$`git -C ${dir} -c user.name=t -c user.email=t@t commit -qm base`.quiet().nothrow();

  const run = async (...extra: string[]): Promise<number> => {
    const proc = Bun.spawn(["bun", `${dir}/dev/gates/deletion-guard.ts`, ...extra], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    await new Response(proc.stdout).text();
    await new Response(proc.stderr).text();
    return await proc.exited;
  };

  console.log("deletion guard selftest");

  check("a clean index passes", (await run()) === 0);

  // An ordinary deletion is not the harness's business.
  writeFileSync(`${dir}/dev/scratch.txt`, "x");
  await Bun.$`git -C ${dir} add -A`.quiet().nothrow();
  await Bun.$`git -C ${dir} -c user.name=t -c user.email=t@t commit -qm scratch`.quiet().nothrow();
  await Bun.$`git -C ${dir} rm -q dev/scratch.txt`.quiet().nothrow();
  check("an ordinary deletion passes", (await run()) === 0);
  await Bun.$`git -C ${dir} -c user.name=t -c user.email=t@t commit -qm rm-scratch`.quiet().nothrow();

  // THE N18 CASE.
  await Bun.$`git -C ${dir} rm -q dev/gates/ratchet.ts`.quiet().nothrow();
  check("deleting a GUARDED gate is refused", (await run()) === 1);

  // …and the range form, which is CI's backstop after the deletion is already committed.
  await Bun.$`git -C ${dir} -c user.name=t -c user.email=t@t commit -qm rm-ratchet`.quiet().nothrow();
  check("a clean index passes again after the commit", (await run()) === 0);
  check("but the RANGE form still catches it", (await run("--range", "HEAD~1..HEAD")) === 1);

  /**
   * THE DELETE-AND-RECREATE CASE. An endpoint diff is blind to it — the path exists at both ends —
   * so the range form has to walk commits. This is the variant that would land a weakened gate
   * CI-green for anyone who reached the repository without passing the pre-commit door.
   */
  writeFileSync(`${dir}/dev/gates/ratchet.ts`, "export {};\n// weakened\n");
  await Bun.$`git -C ${dir} add -A`.quiet().nothrow();
  await Bun.$`git -C ${dir} -c user.name=t -c user.email=t@t commit -qm re-add`.quiet().nothrow();

  const endpointBlind =
    (await Bun.$`git -C ${dir} diff HEAD~2..HEAD --name-only --diff-filter=D`.quiet().nothrow().text()).trim() === "";
  check("an endpoint diff really is blind to delete+recreate (the premise)", endpointBlind);
  check(
    "the range form catches delete+recreate across two commits",
    (await run("--range", "HEAD~2..HEAD")) === 1,
  );
  // And it must not cry wolf on a range where nothing guarded was ever deleted.
  check("a range with no guarded deletion passes", (await run("--range", "HEAD~1..HEAD")) === 0);

  /**
   * THE MERGE-RESOLUTION CASE (N20). `diff-tree -r` prints nothing for a merge unless asked, so a
   * guarded path dropped during conflict resolution lives in the merge's tree and in no ordinary
   * commit. Premise-first again: assert the DEFAULT diff-tree really is silent on this merge
   * before asserting the guard is not, so the case cannot pass for the wrong reason.
   *
   * Spawn argv explicitly. `Bun.$`…${args}` with an array is not portable — CI 2026-08-02 saw
   * parentCount=1 because the merge never became a merge commit under the template expansion.
   */
  const git = async (...args: string[]): Promise<{ code: number; out: string }> => {
    const proc = Bun.spawn(
      ["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args],
      { stdout: "pipe", stderr: "pipe" },
    );
    const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
    return { code: await proc.exited, out };
  };
  const gitOk = async (...args: string[]): Promise<string> => {
    const r = await git(...args);
    if (r.code !== 0) {
      throw new Error(`git ${args.join(" ")} failed (${r.code}): ${r.out.slice(0, 400)}`);
    }
    return r.out;
  };

  await gitOk("checkout", "-q", "-b", "side");
  writeFileSync(`${dir}/dev/side.txt`, "side\n");
  await gitOk("add", "-A");
  await gitOk("commit", "-qm", "side");
  // Discover the non-side branch (git init default is `master` or `main` depending on version).
  const branches = (await gitOk("branch", "--list"))
    .split("\n")
    .map((l) => l.replace(/^[* ]+/, "").trim())
    .filter(Boolean);
  const home = branches.find((b) => b !== "side") ?? "master";
  await gitOk("checkout", "-q", home);
  writeFileSync(`${dir}/dev/mainline.txt`, "main\n");
  await gitOk("add", "-A");
  await gitOk("commit", "-qm", "mainline");
  const mergeBase = (await gitOk("rev-parse", "HEAD")).trim();
  // --no-ff forces a merge commit even when a fast-forward is possible.
  const mergeStart = await git("merge", "--no-ff", "--no-commit", "-q", "side");
  if (mergeStart.code !== 0) {
    throw new Error(`merge --no-ff --no-commit side failed: ${mergeStart.out.slice(0, 400)}`);
  }
  // The deletion exists ONLY in the merge commit — no non-merge commit ever removed the file.
  await gitOk("rm", "-q", "--cached", "dev/gates/ratchet.ts");
  rmSync(`${dir}/dev/gates/ratchet.ts`, { force: true });
  await gitOk("commit", "-qm", "merge side, dropping ratchet in the resolution");

  const mergeSha = (await gitOk("rev-parse", "HEAD")).trim();
  const parentCount = (await gitOk("rev-list", "--parents", "-n1", mergeSha)).trim().split(/\s+/).length - 1;
  check("the fixture really produced a two-parent merge (the premise)", parentCount === 2);
  if (parentCount !== 2) {
    console.error(
      `        got parentCount=${parentCount} sha=${mergeSha} home=${home} branches=${branches.join(",")}`,
    );
  }
  const defaultBlind =
    (await gitOk("diff-tree", "--no-commit-id", "-r", "--name-only", "--diff-filter=D", mergeSha)).trim() === "";
  check("default diff-tree really is silent on a merge (the premise)", defaultBlind);
  check(
    "the range form catches a deletion that arrived as merge resolution",
    (await run("--range", `${mergeBase}..HEAD`)) === 1,
  );

  /**
   * AN UNRESOLVABLE RANGE IS NOT CLEAN. The null sha GitHub sends as `event.before` on a first
   * push used to fall through `nothrow` into an empty rev list and print `clean`. Exit 2, because
   * "the question could not be asked" is a different outcome from "the answer was no".
   */
  const nullSha = "0000000000000000000000000000000000000000";
  check("a null-sha base falls back rather than reading clean", (await run("--range", `${nullSha}..HEAD`)) === 1);
  check("a garbage range that cannot even fall back fails closed", (await run("--range", "nope..alsonope")) === 2);

  rmSync(dir, { recursive: true, force: true });
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}
