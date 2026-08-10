#!/usr/bin/env bun
/**
 * THE WALL RATCHET — checks that the walls still work, rather than who edited them.
 *
 * WHY THIS AND NOT A BETTER LOCK
 * This machine grants `(ALL) NOPASSWD: ALL`. An agent holding Bash therefore holds root, and no
 * on-machine boundary survives that: file ownership, a setuid helper, another UID, `chattr +a`,
 * the keyring, a signing key on this disk — all one `sudo` away from irrelevant. A permission
 * system assumes you can name a principal the adversary cannot become. Here you cannot.
 *
 * So this gate does not ask permission questions at all. It asks whether every synthetic
 * violation in dev/walls/corpus.toml is still refused by the live chain. Weaken a rule and its
 * entries stop being caught; the gate goes red with nobody needing to notice by eye. That needs
 * no trusted principal, which is the entire point.
 *
 * TWO RATCHETS
 *   1. EVERY corpus entry must be refused. No exceptions, no allowlist.
 *   2. The corpus may only GROW. The floor is `git show HEAD:dev/walls/corpus.toml`, so lowering
 *      it requires a commit, and the previous count is then in history that is pushed off this
 *      machine. Comparing against git rather than a baseline file matters: a plain baseline is one
 *      more file to edit in the same breath, whereas history has to be rewritten and force-pushed.
 *
 * HONEST LIMIT. An agent with root can delete corpus entries, commit, and force-push. Nothing
 * here prevents that. What it buys is that the bypass stops being a quiet flag and becomes three
 * self-incriminating edits — a weakened rule, deleted synthetic violations, and a history rewrite
 * — each one obvious in a diff, and the last one visible on a remote this machine does not own.
 * GitHub branch protection is the only boundary in this whole design that is genuinely beyond the
 * reach of an agent on this box.
 */

import { registry } from "../../.claude/hooks/registry.ts";
import type { HookPayload } from "../../.claude/hooks/types.ts";

type Violation = {
  readonly id: string;
  readonly wall: string;
  readonly path: string;
  readonly content: string;
  readonly why: string;
  /** Defaults to Write. Present so tool classes other than Write can be expressed at all. */
  readonly tool: string;
  /**
   * Extra `tool_input` keys, merged over the synthesised defaults. Without this the corpus could
   * only ever describe `Write` payloads carrying `content`, so NotebookEdit (`notebook_path`) and
   * Edit (`new_string`) were shapes the ratchet COULD NOT EXPRESS — and both turned out to be live
   * holes. A corpus that cannot describe a whole tool class leaves it outside the ratchet forever.
   */
  readonly input: Record<string, unknown>;
};

const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim();

function parseCorpus(text: string): Violation[] {
  const parsed = Bun.TOML.parse(text) as { violations?: readonly Record<string, unknown>[] };
  return (parsed.violations ?? []).map((entry) => ({
    id: String(entry["id"] ?? ""),
    wall: String(entry["wall"] ?? ""),
    path: String(entry["path"] ?? ""),
    content: String(entry["content"] ?? ""),
    why: String(entry["why"] ?? ""),
    tool: String(entry["tool"] ?? "Write"),
    input:
      typeof entry["input"] === "object" && entry["input"] !== null
        ? (entry["input"] as Record<string, unknown>)
        : {},
  }));
}

const corpus = parseCorpus(await Bun.file(`${root}/dev/walls/corpus.toml`).text());

// ── ratchet 2: the corpus may only grow ───────────────────────────────────────────────────────

/**
 * WHICH BASELINE, AND WHY IT DIFFERS IN CI.
 *
 * Locally the interesting comparison is worktree vs HEAD: it catches an uncommitted deletion
 * before it is ever recorded.
 *
 * In CI that comparison is worthless — the checkout IS HEAD, so worktree and baseline are the same
 * bytes and the ratchet is trivially green. Which happens to be exactly where the real attack
 * lives: weaken a rule and shrink the corpus in the SAME commit, and every commit's corpus matches
 * its own HEAD forever. The first version of this gate shipped with that hole and a local proof
 * that could not have found it.
 *
 * So in CI the baseline is the PARENT commit, and growth must be monotonic across the push.
 */
/**
 * In CI the baseline is the PUSH BASE, not HEAD~1.
 *
 * HEAD~1 only covers the last commit of a push. A push containing three commits where the corpus
 * shrinks in the first and is untouched in the last compares HEAD against HEAD~1, sees no change,
 * and passes — while the shrink sailed through. `github.event.before` is the commit the branch was
 * at before the push, so comparing against it covers the whole pushed range.
 *
 * Falls back to HEAD~1 when the push base is absent or unresolvable: a first push has
 * before=000000..., and a force-push may name a commit this checkout does not have.
 */
const inCI = process.env["CI"] === "true" || process.env["GITHUB_ACTIONS"] === "true";

async function resolveBaseline(): Promise<string> {
  if (!inCI) return "HEAD";

  const pushBase = (process.env["COMPOSE_PUSH_BASE"] ?? process.env["GITHUB_EVENT_BEFORE"] ?? "").trim();
  const isNullSha = pushBase === "" || /^0+$/.test(pushBase);
  if (isNullSha) return "HEAD~1";

  const resolved = await Bun.$`git rev-parse --verify --quiet ${`${pushBase}^{commit}`}`
    .quiet()
    .nothrow()
    .text();
  return resolved.trim() === "" ? "HEAD~1" : pushBase;
}

const baselineRef = await resolveBaseline();

const committed = await Bun.$`git show ${`${baselineRef}:dev/walls/corpus.toml`}`
  .quiet()
  .nothrow()
  .text();

// A missing baseline is not a failure: the corpus's own first commit has no parent to compare
// against, and neither does a repository's root commit. Both are honestly unprotected.
const committedCount = committed.trim() === "" ? 0 : parseCorpus(committed).length;

const failures: string[] = [];

if (corpus.length < committedCount) {
  failures.push(
    `the corpus SHRANK: ${committedCount} entries at ${baselineRef}, ${corpus.length} now.\n` +
      `    Synthetic violations are only removed when a wall is being weakened. If a rule genuinely\n` +
      `    changed shape, rewrite the entry rather than deleting it.`,
  );
}

/**
 * RATCHET 3 — existing entries are IMMUTABLE. Only additions are allowed.
 *
 * The count ratchet guards cardinality, not semantics. A same-count substitution defeats it
 * completely: retarget `GRANT-runner` from `runner.ts` to some other already-refused path and the
 * corpus still reports 37/37 green while runner coverage silently dies. Nothing goes red, and the
 * only trace is a diff line nobody is required to read.
 *
 * So an entry's (wall, path, tool) triple is frozen once committed. Changing one is not editing a
 * test — it is retiring a wall's coverage and standing up different coverage under the same name.
 * That deserves a new id and a note saying why, which is exactly what this refusal forces.
 *
 * `why` and `content` stay mutable: sharpening the explanation of a violation is not weakening it.
 */
const baselineById = new Map(
  (committed.trim() === "" ? [] : parseCorpus(committed)).map((entry) => [entry.id, entry]),
);

/**
 * RATCHET 3a — the id SET may only grow. This is the clause the first version missed.
 *
 * The intended invariant is "no deletions, no modifications, only additions", and the loop below
 * enforces only the middle one: it walks CURRENT entries and looks each up in the baseline, so a
 * deleted id is never examined at all. Paired with a same-commit addition it defeats every other
 * check simultaneously — proven live: delete `GRANT-runner`, add a fresh-id entry pointing at
 * another still-refused path, and the count holds at 39→39 (ratchet-2 silent), the missing id is
 * never iterated (ratchet-3 silent), and every remaining entry is still refused (ratchet-1 green).
 * Exit 0, with runner coverage quietly retired.
 *
 * A pure deletion was caught. A deletion wearing an addition was not. Iterating the BASELINE
 * rather than the current set is what closes it.
 */
const currentIds = new Set(corpus.map((entry) => entry.id));
for (const id of baselineById.keys()) {
  if (currentIds.has(id)) continue;
  failures.push(
    `${id} was DELETED from the corpus (present at ${baselineRef}, absent now).\n` +
      `    The id set may only grow. A deletion paired with an addition keeps the count flat and\n` +
      `    leaves nothing for the retarget check to compare — which is exactly how a wall's\n` +
      `    coverage gets retired without anything going red.\n` +
      `    If this wall genuinely no longer applies, that is an operator decision with a note,\n` +
      `    not a silent line removal.`,
  );
}

for (const entry of corpus) {
  const before = baselineById.get(entry.id);
  if (before === undefined) continue; // a new entry — additions are the point

  const drifted = (["wall", "path", "tool"] as const).filter((field) => before[field] !== entry[field]);
  if (drifted.length === 0) continue;

  failures.push(
    `${entry.id} was RETARGETED (${drifted.join(", ")} changed since ${baselineRef}).\n` +
      drifted
        .map((field) => `      ${field}: ${JSON.stringify(before[field])} → ${JSON.stringify(entry[field])}`)
        .join("\n") +
      `\n    An entry's target is frozen once committed, because the count ratchet cannot see a\n` +
      `    same-cardinality substitution: the corpus stays green while the coverage it names dies.\n` +
      `    If this wall genuinely changed shape, add a NEW entry with a new id and leave this one\n` +
      `    to fail honestly — a retired wall should be visible, not overwritten.`,
  );
}

// ── ratchet 1: every entry is still refused ───────────────────────────────────────────────────

/**
 * HERMETIC AT-REST MEASUREMENT (operator ruling 2026-08-02; replaces refuse-while-a-grant-is-live,
 * promote upstream). The old shape made every grant window an outage: no seat could run the full
 * gate until a human revoked or the clock ran out — operator babysitting as a load-bearing step,
 * and idle agents waiting on an expiry. The ratchet asks what the walls do in their DEFAULT state,
 * so it now CONSTRUCTS that state instead of demanding it: GRANT_STORE_ASSUME_REST forces
 * liveGrant() to answer "no grant" for this process and its children, and the corpus is measured
 * against the walls' resting logic no matter what windows are open anywhere.
 *
 * Why this cannot be a bypass: forcing "no grant" can only make every consumer of liveGrant()
 * block MORE, never less. The flag opens nothing. An attacker setting it gets stricter walls.
 *
 * N21's lesson survives underneath: grant state is read through liveGrant(), the one shared
 * checker — never through "does the token file exist".
 */
process.env["GRANT_STORE_ASSUME_REST"] = "1";

const walls = new Map(registry.filter((m) => m.events.includes("PreToolUse")).map((m) => [m.name, m]));

for (const violation of corpus) {
  const wall = walls.get(violation.wall);
  if (wall === undefined) {
    failures.push(`${violation.id}: names wall "${violation.wall}", which is not in the registry`);
    continue;
  }

  const payload: HookPayload = {
    tool_name: violation.tool,
    tool_input: {
      file_path: `${root}/${violation.path}`,
      content: violation.content,
      // Entry-supplied keys win, so an entry can drop file_path entirely and use notebook_path,
      // or replace content with new_string.
      ...violation.input,
    },
    cwd: root,
  };
  if (violation.input["notebook_path"] !== undefined) delete payload.tool_input?.["file_path"];
  if (violation.input["new_string"] !== undefined) delete payload.tool_input?.["content"];

  // `run` may be sync or async — HookVerdict | Promise<HookVerdict> — so it cannot be `.catch`ed
  // directly. A module that throws counts as "did not refuse", which is the correct reading: a
  // crashing wall protects nothing.
  const verdict = await Promise.resolve()
    .then(() => wall.run(payload))
    .catch(() => null);

  if (verdict?.kind !== "block") {
    failures.push(
      `${violation.id} is NO LONGER REFUSED by ${violation.wall}\n` +
        `    path: ${violation.path}\n` +
        `    why it must be caught: ${violation.why}`,
    );
  }
}

// ── report ────────────────────────────────────────────────────────────────────────────────────

if (failures.length === 0) {
  console.log(
    `ratchet: ${corpus.length} synthetic violations all refused` +
      (committedCount > 0 ? ` · corpus ${committedCount} → ${corpus.length}` : ""),
  );
  process.exit(0);
}

console.error(`ratchet: ${failures.length} problem(s)\n`);
for (const failure of failures) console.error(`  ${failure}\n`);
console.error(
  "A wall stopped refusing something it used to refuse. That is either a regression or a\n" +
    "deliberate weakening — and the corpus exists so the difference has to be argued out loud\n" +
    "instead of happening quietly.",
);
process.exit(1);
