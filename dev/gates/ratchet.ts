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
 * The one lawful shrink is a RETIREMENT: the id moves from `violations` to `retired` with the
 * operator's dated ruling beside it (the grant-system entries, 2026-08-13, are the first).
 * Anything else that shrinks the corpus is red, on this machine and in CI.
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

const corpusText = await Bun.file(`${root}/dev/walls/corpus.toml`).text();
const corpus = parseCorpus(corpusText);

/**
 * RETIREMENTS — the only lawful way for the corpus to shrink.
 *
 * The ratchet's own refusal text always said retiring a wall is "an operator decision with a
 * note", but offered no channel for the note: every deletion was red forever, even one the
 * operator had just ordered out loud. That gap made the grant-system removal (operator ruling
 * 2026-08-13) impossible to land green, which is the ratchet blocking its own maintenance.
 *
 * So a retirement is DATA: `retired = [ { id, wall }, ... ]` beside the violations, carrying the
 * removed id and the wall it belonged to, with the dated ruling in a comment. A deletion named
 * here is lawful; one that is not remains red. The list is checked just as hard as the corpus:
 * retiring nothing, retiring twice, a mislabelled wall, or a "retired" id still present are all
 * failures — a retirement list that can drift is the same hole with a second door.
 */
type Retirement = { readonly id: string; readonly wall: string };
const parseRetired = (text: string): readonly Retirement[] =>
  ((Bun.TOML.parse(text) as { retired?: readonly Record<string, unknown>[] }).retired ?? []).map(
    (entry) => ({ id: String(entry["id"] ?? ""), wall: String(entry["wall"] ?? "") }),
  );
const retired: readonly Retirement[] = parseRetired(corpusText);

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
  if (resolved.trim() !== "") return pushBase;
  console.warn(
    `ratchet: push base ${pushBase.slice(0, 12)} does not resolve in this checkout — falling back\n` +
      `  to HEAD~1, which covers the last commit ONLY. Anything earlier in this push is unexamined.`,
  );
  return "HEAD~1";
}

const baselineRef = await resolveBaseline();

/**
 * THE BASELINE ORACLE, FAIL-CLOSED. `git show <ref>:<path>` failing is NOT the same as "the
 * corpus is absent at a resolved ref": a push base a shallow checkout lacks, or a force-pushed
 * base, both read as an empty string under nothrow — and ratchets 2/3/3a then examine NOTHING
 * while the report prints full success. So the ref is verified first: unresolvable in CI is a
 * hard failure (exit 2), because a backstop that cannot ask its question must not report clean.
 * Locally an unverifiable HEAD is the honest root-commit case — nothing precedes it.
 */
const refCheck = await Bun.$`git rev-parse --verify --quiet ${`${baselineRef}^{commit}`}`
  .quiet()
  .nothrow();
let committed = "";
if (refCheck.exitCode !== 0) {
  if (inCI) {
    console.error(
      `ratchet: CANNOT RESOLVE the baseline ${JSON.stringify(baselineRef)} in this checkout.\n\n` +
        `  This is not a clean result. The growth and immutability ratchets compare against the\n` +
        `  push base; a checkout that lacks it (shallow clone, force-pushed base) makes every one\n` +
        `  of those checks a silent no-op that prints success. Give the checkout fetch-depth 0.`,
    );
    process.exit(2);
  }
  const headCheck = await Bun.$`git rev-parse --verify --quiet HEAD`.quiet().nothrow();
  if (headCheck.exitCode === 0) {
    console.warn(
      `ratchet: baseline ${baselineRef} does not resolve locally — treating the corpus as unbaselined.\n` +
        `  (The growth/immutability ratchets examine nothing this run. This line exists so that is never silent.)`,
    );
  }
} else {
  const show = await Bun.$`git show ${`${baselineRef}:dev/walls/corpus.toml`}`.quiet().nothrow();
  // Exit != 0 here means the PATH is absent at a resolved ref — the corpus's own first commit,
  // an honestly unprotected state the comment below describes.
  committed = show.exitCode === 0 ? show.text() : "";
}

// A missing baseline is not a failure: the corpus's own first commit has no parent to compare
// against, and neither does a repository's root commit. Both are honestly unprotected — and
// both are PRINTED now, not inferred from an empty string that could also mean "git failed".
const committedCount = committed.trim() === "" ? 0 : parseCorpus(committed).length;

const baselineById = new Map(
  (committed.trim() === "" ? [] : parseCorpus(committed)).map((entry) => [entry.id, entry]),
);
const currentIdsBelow = new Set(corpus.map((entry) => entry.id));

const failures: string[] = [];

// A retirement is FRESH (its id is a baseline violation) or RECORDED (its id is already in the
// baseline's own retired list). Anything else retires nothing. The recorded branch is what lets
// a lawful retirement stay green forever after its commit — the steady state must not punish
// its own record.
const retiredBaseline = parseRetired(committed);
const retiredBaselineById = new Map(retiredBaseline.map((entry) => [entry.id, entry]));

const retiredIds = new Set<string>();
for (const entry of retired) {
  if (retiredIds.has(entry.id)) {
    failures.push(`${entry.id} is retired TWICE — the list is a record, not a pile`);
  }
  retiredIds.add(entry.id);
  const fresh = baselineById.get(entry.id);
  const recorded = retiredBaselineById.get(entry.id);
  const expectedWall = fresh?.wall ?? recorded?.wall ?? "";
  if (fresh === undefined && recorded === undefined) {
    failures.push(
      `${entry.id} is retired but names nothing at ${baselineRef} — neither a violation there\n` +
        `    nor a recorded retirement.\n` +
        `    A retirement that retires nothing is noise, and this list is where a real\n` +
        `    deletion would learn to hide.`,
    );
    continue;
  }
  if (expectedWall !== entry.wall) {
    failures.push(
      `${entry.id} retired under wall "${entry.wall}" but belonged to "${expectedWall}" at ${baselineRef}.\n` +
        `    A mislabelled retirement is a mislabelled deletion.`,
    );
  }
}

// The record is not a scratch pad: a baseline retirement that vanishes from the list without the
// violation returning is a deleted HISTORY entry — the one removal the count ratchet cannot see.
for (const entry of retiredBaseline) {
  if (retiredIds.has(entry.id)) continue;
  if (currentIdsBelow.has(entry.id)) continue; // reinstated coverage — argued in the diff
  failures.push(
    `${entry.id} was a recorded retirement at ${baselineRef} and is gone from the record now.\n` +
      `    Restore the violation (re-earned coverage) or keep the record — never drop it quietly.`,
  );
}

if (corpus.length + retiredIds.size < committedCount) {
  failures.push(
    `the corpus SHRANK: ${committedCount} entries at ${baselineRef}, ${corpus.length} now (${retiredIds.size} retired).\n` +
      `    Synthetic violations leave only as retirements: move the id to \`retired\` with the\n` +
      `    operator's ruling in a dated comment. A bare deletion is a weakening until argued otherwise.`,
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
const currentIds = currentIdsBelow;
for (const id of baselineById.keys()) {
  if (currentIds.has(id)) continue;
  if (retiredIds.has(id)) continue; // a lawful retirement — its validity was checked above
  failures.push(
    `${id} was DELETED from the corpus (present at ${baselineRef}, absent now, not retired).\n` +
      `    The id set may only grow. A deletion paired with an addition keeps the count flat and\n` +
      `    leaves nothing for the retarget check to compare — which is exactly how a wall's\n` +
      `    coverage gets retired without anything going red.\n` +
      `    If this wall genuinely no longer applies, that is an operator ruling recorded in\n` +
      `    \`retired\` with a date and a reason — never a silent line removal.`,
  );
}

for (const entry of retired) {
  if (currentIds.has(entry.id)) {
    failures.push(
      `${entry.id} is retired AND still present in the corpus — a retirement is the removal\n` +
        `    of the entry, not a label over it.`,
    );
  }
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
