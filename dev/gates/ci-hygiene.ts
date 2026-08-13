#!/usr/bin/env bun
/**
 * THE WORKFLOW FILES ARE THE ONLY UNLINTED SURFACE IN A LINTED REPOSITORY, AND THEY ARE THE
 * PRIVILEGED ONE.
 *
 * Everything else here is walled: ast-grep rules, the hook chain, the corpus ratchet, the ledger
 * CLIs. `.github/workflows/` had nothing — no typecheck, no lint, no gate — while being the file
 * that decides whether any of the others run at all.
 *
 * This encodes brain concept #1054 (professional-grade CI/CD recipe, Rev 2 — derived from a
 * 15-agent adversarial audit of torad-fleet, 66 findings, plus an Eli parallax pass) as a CHECK
 * rather than as a checklist someone re-reads. The recipe's own §1 is a bash scorecard a human
 * runs and interprets; a scorecard nobody runs is a wall nobody built, so it is a gate here.
 *
 * WHAT IT ENFORCES, and the recipe item each comes from:
 *
 *   T1  every job has timeout-minutes        default cap is 6h; one hung container burns 360 min
 *   T2  every third-party `uses:` is SHA-pinned to 40 hex   tj-actions/changed-files
 *       (CVE-2025-30066) was compromised by REWRITING TAGS — a version tag is not a pin
 *   T3  top-level `permissions:` present     escalate per job, never inherit write by default
 *   T7  `concurrency:` on every workflow
 *   T11 the aggregate check names EVERY job in `needs:`   the completeness hole: guarding
 *       needs -> classifier while never guarding jobs -> needs means a NEW job is silently
 *       not required, and the required check goes green without it
 *   T21 one toolchain pin, referenced everywhere   JDK 17 in one job and 21 in the rest is a
 *       silent divergence class
 *
 * NOT ENFORCED, deliberately: anything from the recipe's Tier 2. Those are SHAPE-GATED — they
 * apply only when a named trigger holds (deploys live state, publishes a consumed artifact,
 * cross-compiles, >5min suite, observed flakiness). None hold for this repository yet. The
 * recipe's own scarcity rule is explicit that importing a right practice with its scarcity
 * stripped off is the definition of cargo-cult, so they are absent on purpose rather than
 * missing by oversight.
 *
 *   bun dev/gates/ci-hygiene.ts
 *   bun dev/gates/ci-hygiene.ts --selftest
 *
 * WHY A HAND PARSER. Adding a YAML dependency means editing package.json, which is guarded, and
 * pulling a parser into the one place that must not silently change behaviour. These workflows
 * are small and written here; the parser only has to understand the shapes this repo actually
 * writes, and it fails LOUD on anything it cannot read rather than skipping it.
 */

export type Workflow = {
  readonly name: string;
  readonly text: string;
};

export type Finding = { readonly item: string; readonly detail: string };

/** Top-level `jobs:` keys — two-space indent directly under a line that is exactly `jobs:`. */
export function jobNames(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trimEnd() === "jobs:");
  if (start === -1) return [];

  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim() !== "") break; // dedented out of jobs:
    const match = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (match?.[1] !== undefined) names.push(match[1]);
  }
  return names;
}

/** `needs:` values in either form: `needs: [a, b]` or a block list. */
export function needsOf(text: string, job: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^ {2}${job}:\\s*$`).test(line));
  if (start === -1) return [];

  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^ {2}\S/.test(line)) break; // next job
    const inline = /^ {4}needs:\s*\[(.*)\]\s*$/.exec(line);
    if (inline?.[1] !== undefined) {
      for (const part of inline[1].split(",")) {
        const name = part.trim();
        if (name !== "") out.push(name);
      }
      continue;
    }
    if (/^ {4}needs:\s*$/.test(line)) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const item = /^ {6}- ([A-Za-z0-9_-]+)\s*$/.exec(lines[j] ?? "");
        if (item?.[1] === undefined) break;
        out.push(item[1]);
      }
    }
  }
  return out;
}

/** Every job that declares its own `timeout-minutes`. */
export function jobsWithTimeout(text: string): Set<string> {
  const found = new Set<string>();
  const lines = text.split("\n");
  let current: string | null = null;
  for (const line of lines) {
    const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (job?.[1] !== undefined && jobNames(text).includes(job[1])) {
      current = job[1];
      continue;
    }
    if (current !== null && /^ {4}timeout-minutes:/.test(line)) found.add(current);
  }
  return found;
}

/**
 * Jobs that call a reusable workflow — a job-level `uses:` at 4 spaces, as opposed to a step's
 * `- uses:` at 6.
 *
 * These CANNOT carry `timeout-minutes`: GitHub rejects the key on a reusable-workflow call as
 * invalid workflow syntax, so T1 is unsatisfiable for them. The timeout belongs to the jobs
 * inside the called workflow, where that file's own gate enforces it. Demanding it here made the
 * gate reject a file no valid edit could fix.
 */
export function jobsCallingReusable(text: string): Set<string> {
  const found = new Set<string>();
  const names = jobNames(text);
  let current: string | null = null;
  for (const line of text.split("\n")) {
    const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (job?.[1] !== undefined && names.includes(job[1])) {
      current = job[1];
      continue;
    }
    if (current !== null && /^ {4}uses:/.test(line)) found.add(current);
  }
  return found;
}

/** `uses:` references that are not pinned to a 40-char SHA. Local `./` refs are exempt. */
export function unpinnedUses(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)) {
    const ref = match[1];
    if (ref === undefined) continue;
    if (ref.startsWith("./") || ref.startsWith("docker://")) continue;
    if (!/@[0-9a-f]{40}$/.test(ref)) out.push(ref);
  }
  return out;
}

/**
 * The aggregate is the job every other job must feed. It is identified by name rather than
 * inferred, because inferring "the job with the most needs" would silently pick a new aggregate
 * the day someone adds a fan-in for another reason.
 */
export const AGGREGATE = "gate-ok";

export function audit(workflows: readonly Workflow[]): Finding[] {
  const findings: Finding[] = [];

  for (const wf of workflows) {
    const jobs = jobNames(wf.text);
    if (jobs.length === 0) {
      findings.push({ item: "parse", detail: `${wf.name}: no jobs found — the parser could not read this file` });
      continue;
    }

    const timed = jobsWithTimeout(wf.text);
    const reusable = jobsCallingReusable(wf.text);
    for (const job of jobs) {
      if (!timed.has(job) && !reusable.has(job)) {
        findings.push({ item: "T1", detail: `${wf.name}: job "${job}" has no timeout-minutes` });
      }
    }

    for (const ref of unpinnedUses(wf.text)) {
      findings.push({ item: "T2", detail: `${wf.name}: "${ref}" is not pinned to a 40-char SHA` });
    }

    // Block form (`permissions:` + nested keys) or an inline value (`permissions: {}`,
    // `read-all`, `write-all`). Matching only the block form rejected `permissions: {}` — grant
    // NOTHING, the most restrictive setting there is — and so pushed files toward a weaker one.
    if (!/^permissions:(\s*$|\s+\S)/m.test(wf.text)) {
      findings.push({ item: "T3", detail: `${wf.name}: no top-level permissions: block` });
    }
    if (!/^concurrency:\s*$/m.test(wf.text)) {
      findings.push({ item: "T7", detail: `${wf.name}: no concurrency: block` });
    }

    // T11 — the completeness hole. Only meaningful in a workflow that HAS the aggregate.
    if (jobs.includes(AGGREGATE)) {
      const needs = new Set(needsOf(wf.text, AGGREGATE));
      for (const job of jobs) {
        if (job === AGGREGATE) continue;
        if (!needs.has(job)) {
          findings.push({
            item: "T11",
            detail: `${wf.name}: job "${job}" is not in ${AGGREGATE}'s needs — it cannot fail the required check`,
          });
        }
      }
    }
  }

  return findings;
}

if (import.meta.main) {
  if (Bun.argv.includes("--selftest")) {
    await selftest();
    process.exit(0);
  }

  const root = (await Bun.$`git rev-parse --show-toplevel`.quiet().nothrow().text()).trim() || ".";
  const listed = await Bun.$`git -C ${root} ls-files -z .github/workflows`.quiet().nothrow().text();
  const paths = listed.split("\0").filter((p) => p.endsWith(".yml") || p.endsWith(".yaml"));

  // A clean result from a scan that read nothing is the false pass this repo has manufactured
  // twice already — once on an exit code, once on an escaped glob.
  if (paths.length === 0) {
    console.error("ci-hygiene: no workflow files found under .github/workflows — refusing to report clean");
    process.exit(2);
  }

  const workflows: Workflow[] = await Promise.all(
    paths.map(async (name) => ({ name, text: await Bun.file(`${root}/${name}`).text() })),
  );

  const findings = audit(workflows);
  if (findings.length === 0) {
    console.log(`ci-hygiene: clean · ${workflows.length} workflow(s), ${workflows.reduce((n, w) => n + jobNames(w.text).length, 0)} job(s)`);
    process.exit(0);
  }

  console.error(`ci-hygiene: ${findings.length} finding(s)\n`);
  for (const f of findings) console.error(`  [${f.item}] ${f.detail}`);
  console.error(
    `\nThese are Tier 1 of brain concept #1054 — universal, not shape-gated. The workflow file is\n` +
      `the surface that decides whether every other wall runs, and it is the one nothing else checks.`,
  );
  process.exit(1);
}

async function selftest(): Promise<void> {
  let failures = 0;
  let checks = 0;
  const check = (label: string, ok: boolean): void => {
    checks += 1;
    if (ok) return;
    failures += 1;
    console.error(`  FAIL  ${label}`);
  };

  console.log("ci-hygiene selftest");

  const clean = `name: x
permissions:
  contents: read
concurrency:
  group: x
jobs:
  build:
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@1111111111111111111111111111111111111111
  gate-ok:
    needs: [build]
    timeout-minutes: 5
`;
  const wf = (text: string): Workflow[] => [{ name: "w.yml", text }];

  // The premise: the clean fixture must actually parse into the jobs it claims, or every
  // "violation is caught" case below would also pass against a file the parser could not read.
  check("the clean fixture parses into 2 jobs (the premise)", jobNames(clean).length === 2);
  check("a compliant workflow is clean", audit(wf(clean)).length === 0);

  check(
    "a job without timeout-minutes is caught (T1)",
    audit(wf(clean.replace("  build:\n    timeout-minutes: 5\n", "  build:\n"))).some((f) => f.item === "T1"),
  );
  check(
    "a version-tagged action is caught (T2)",
    audit(wf(clean.replace(/@1{40}/, "@v4"))).some((f) => f.item === "T2"),
  );
  check(
    "a missing permissions block is caught (T3)",
    audit(wf(clean.replace("permissions:\n  contents: read\n", ""))).some((f) => f.item === "T3"),
  );
  check(
    "a missing concurrency block is caught (T7)",
    audit(wf(clean.replace("concurrency:\n  group: x\n", ""))).some((f) => f.item === "T7"),
  );

  /**
   * The two false positives that blocked the operator's synced agent-review.yml, both of which
   * demanded a file be made WORSE (or unparseable) to pass.
   *
   * A reusable-workflow call rejects `timeout-minutes` as invalid syntax, so T1 had no satisfiable
   * fix; `permissions: {}` grants nothing at all, so T3 was rejecting the strictest possible form.
   * The exemption stays narrow — everything else still applies to such a job.
   */
  const reusableCall = clean
    .replace(
      "  gate-ok:",
      "  review:\n    uses: o/r/.github/workflows/w.yml@1111111111111111111111111111111111111111\n  gate-ok:",
    )
    .replace("needs: [build]", "needs: [build, review]");
  check("a reusable-workflow call is exempt from T1", !audit(wf(reusableCall)).some((f) => f.item === "T1"));
  check("…and that workflow is otherwise clean", audit(wf(reusableCall)).length === 0);
  check(
    "…but an unpinned reusable call is still caught (T2)",
    audit(wf(reusableCall.replace(/w\.yml@1{40}/, "w.yml@main"))).some((f) => f.item === "T2"),
  );
  check(
    "…and a plain job with no timeout is still caught alongside it (T1)",
    audit(wf(reusableCall.replace("  build:\n    timeout-minutes: 5\n", "  build:\n"))).some((f) => f.item === "T1"),
  );
  check(
    "permissions: {} satisfies T3",
    !audit(wf(clean.replace("permissions:\n  contents: read\n", "permissions: {}\n"))).some((f) => f.item === "T3"),
  );

  /**
   * THE COMPLETENESS HOLE (T11), which is the one worth having a gate for. Adding a job is the
   * normal way to extend CI, and forgetting to add it to the aggregate's needs is invisible: the
   * new job runs, can go red, and the required check reports green regardless.
   */
  const extraJob = clean.replace(
    "  gate-ok:",
    "  lint:\n    timeout-minutes: 5\n    steps:\n      - run: true\n  gate-ok:",
  );
  check("a job missing from the aggregate's needs is caught (T11)", audit(wf(extraJob)).some((f) => f.item === "T11"));
  check(
    "…and is clean once it is added to needs",
    audit(wf(extraJob.replace("needs: [build]", "needs: [build, lint]"))).length === 0,
  );
  check(
    "block-form needs: is understood too",
    audit(wf(extraJob.replace("    needs: [build]\n", "    needs:\n      - build\n      - lint\n"))).length === 0,
  );

  // A file the parser cannot read must fail loudly, never silently report clean.
  check("an unparseable workflow is reported, not skipped", audit(wf("name: x\n")).some((f) => f.item === "parse"));

  // Local composite actions are legitimately unpinnable — they are in this repository.
  check(
    "a local ./ action is exempt from the SHA rule",
    audit(wf(clean.replace(/uses: actions\/checkout@1{40}/, "uses: ./.github/actions/setup"))).length === 0,
  );

  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}
