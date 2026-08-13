#!/usr/bin/env bun
/**
 * THE READINESS MATRIX — the PRESENT tense of declare-then-earn (concept #959).
 *
 *   bun dev/matrix.ts <matrix.toml> <command> [args]
 *
 * Three planes run over this build:
 *   dev/manifests/*.toml   FUTURE  — units declared as data before implementation. A referenced-
 *                                    but-missing unit is mechanically visible, never remembered.
 *   dev/matrix.toml        PRESENT — one row per unit: what is proven, and by which artifact.
 *   dev/campaigns/*.toml   PAST/WORK — the campaign backlog and its construction diary.
 *
 * A gate sits between each tense: the future cannot pretend to be present, and the present cannot
 * rewrite the past.
 *
 * FAIL-CLOSED IS THE ENTIRE POINT. `ready` requires a host proof, and `verified` is not a rung
 * anyone sets at all: it is DERIVED at query time — every recorded edge still resolving in the
 * current tree, the latest completed ci run on main green and having tested what main currently
 * is, a review pointer present. Without that rule this is a checklist, and a checklist is
 * something an agent can tick. With it, the matrix is an INPUT the build reads — consumers gate
 * on row status, so an unproven capability stays invisible at runtime and a claim not derived
 * from an earned row cannot ship. You cannot lie to it, which is what makes it worth keeping.
 */

import { dirname, resolve } from "node:path";
import {
  LedgerError,
  mutate,
  parseOrThrow,
  readLines,
  toml,
  today,
} from "./campaigns/ledger-core.ts";
import {
  assertStatusMandates,
  blockNotes,
  handleEarnCommand,
  validateRowMandates,
} from "./campaigns/matrix-earn.ts";

/**
 * The ladder. Each rung needs strictly more evidence than the one below, so "compiles on my
 * machine" and "proven on the target" are different statuses by construction rather than by
 * anyone's discipline.
 */
export type RowStatus = "todo" | "in_flight" | "blocked" | "ready" | "verified";

export const ROW_STATUSES: readonly RowStatus[] = [
  "todo",
  "in_flight",
  "blocked",
  "ready",
  "verified",
];

/** Which proof field each status requires before a row may claim it. */
const REQUIRED_PROOF: Partial<Record<RowStatus, "host_proof">> = {
  ready: "host_proof",
};

/**
 * A PROOF POINTER MUST POINT AT SOMETHING.
 *
 * Fail-closed was form without substance: any non-empty string satisfied it, so `--host ok` or
 * `--host .` earned the rung. That is a checkbox wearing a gate's clothing — precisely the
 * attestation shape this repository already rejected once, where the party being checked supplies
 * the evidence and nothing looks at it.
 *
 * A pointer must now be RESOLVABLE by someone who was not there: a command that was run, a file
 * that exists, a commit sha, a dated device receipt. The check cannot verify the claim is TRUE —
 * nothing textual can — but it can refuse a pointer that names nothing at all, which kills the
 * lazy case that made the rule decorative.
 */
const MIN_PROOF_LENGTH = 12;

const PROOF_SHAPES: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  { pattern: /\b[0-9a-f]{7,40}\b/, what: "a commit sha" },
  { pattern: /\b(bun|gradle|\.\/gradlew|ast-grep|git|npm|cargo|pytest|ninja)\b/, what: "a command that was run" },
  { pattern: /\b\d{4}-\d{2}-\d{2}\b/, what: "a date" },
  { pattern: /\.(ts|kt|kts|toml|yml|yaml|json|log|txt|md)\b/, what: "a file" },
  { pattern: /\bsha256:[0-9a-f]{8,}/, what: "a content hash" },
  { pattern: /\b\d+\s*\/\s*\d+\b/, what: "a pass count" },
];

function rejectProof(pointer: string): string | null {
  const trimmed = pointer.trim();
  if (trimmed.length < MIN_PROOF_LENGTH) {
    return `"${trimmed}" is ${trimmed.length} characters — too short to point at anything a later reader could check`;
  }
  if (!PROOF_SHAPES.some((shape) => shape.pattern.test(trimmed))) {
    return (
      `"${trimmed}" does not resolve to anything checkable.\n` +
      `    A proof pointer names something a later reader can go and look at:\n` +
      PROOF_SHAPES.map((shape) => `      · ${shape.what}`).join("\n")
    );
  }
  return null;
}

/**
 * `verified` IS DERIVED, NEVER WRITTEN.
 *
 * The rung this replaces was a status you SET, guarded by an environment variable — two category
 * errors in one line: ambient authority (a bit of process environment that changes every command
 * under it and records nothing), and a guard on a WRITE when the underlying question is whether a
 * FACT holds. So the present plane stores only what cannot rot — edges and a review pointer —
 * and the verdict is computed fresh, every time. The derivation itself lives below USAGE.
 */

/** An edge is the laws.toml idiom: a file plus the token whose deletion removes the proof. */
export type Edge = { readonly path: string; readonly token: string };

export type Row = {
  readonly id: string;
  readonly layer: string;
  readonly descriptor: string;
  readonly status: RowStatus;
  readonly hostProof: string;
  readonly edges: readonly Edge[];
  readonly review: string;
};

export type RowBlock = { readonly row: Row; readonly start: number; readonly end: number };

const ROW_HEADER = /^\[\[rows\]\]\s*$/;
const TABLE_HEADER = /^\s*\[/;

function isRowStatus(candidate: string): candidate is RowStatus {
  return (ROW_STATUSES as readonly string[]).includes(candidate);
}

function scalar(line: string, key: string): string | null {
  const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*$`));
  return match?.[1] === undefined ? null : match[1].replace(/\\"/g, '"');
}

function locateRows(lines: readonly string[]): RowBlock[] {
  const blocks: RowBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!ROW_HEADER.test(lines[index] ?? "")) continue;

    let end = index + 1;
    while (end < lines.length && !TABLE_HEADER.test(lines[end] ?? "")) end += 1;
    let last = end;
    while (last > index + 1 && (lines[last - 1] ?? "").trim() === "") last -= 1;

    const body = lines.slice(index, last);
    const pick = (key: string): string =>
      body.map((line) => scalar(line, key)).find((value) => value !== null) ?? "";
    const rawStatus = pick("status");

    // Edges ride ONE line of inline tables (the CLI writes them; a hand-edited multi-line array
    // silently scans as zero edges — which is exactly the scanner/parser disagreement `validate`
    // cross-checks, so the back door cannot disagree with the front).
    const edgesLine = body.find((line) => /^\s*edges\s*=\s*\[.*\]\s*$/.test(line));
    let edges: Edge[] = [];
    if (edgesLine !== undefined) {
      const parsedLine = Bun.TOML.parse(edgesLine) as { edges?: readonly Record<string, unknown>[] };
      edges = (parsedLine.edges ?? []).map((entry) => ({
        path: String(entry["path"] ?? ""),
        token: String(entry["token"] ?? ""),
      }));
    }

    blocks.push({
      start: index,
      end: last,
      row: {
        id: pick("id"),
        layer: pick("layer"),
        descriptor: pick("descriptor"),
        status: isRowStatus(rawStatus) ? rawStatus : "todo",
        hostProof: pick("host_proof"),
        edges,
        review: pick("review"),
      },
    });

    index = end - 1;
  }

  return blocks;
}

function findRow(blocks: readonly RowBlock[], id: string): RowBlock {
  const found = blocks.find((block) => block.row.id === id);
  if (found === undefined) throw new LedgerError(`no row with id "${id}"`);
  return found;
}

function setField(lines: readonly string[], block: RowBlock, key: string, value: string): string[] {
  const next = [...lines];
  for (let index = block.start; index < block.end; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(next[index] ?? "")) {
      next[index] = `${key} = ${toml(value)}`;
      return next;
    }
  }
  next.splice(block.end, 0, `${key} = ${toml(value)}`);
  return next;
}

/** setField for non-scalar values (the edges array) — same splice, no quoting. */
function setRawField(lines: readonly string[], block: RowBlock, key: string, raw: string): string[] {
  const next = [...lines];
  for (let index = block.start; index < block.end; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(next[index] ?? "")) {
      next[index] = `${key} = ${raw}`;
      return next;
    }
  }
  next.splice(block.end, 0, `${key} = ${raw}`);
  return next;
}

const MARK: Record<RowStatus, string> = {
  todo: "·",
  in_flight: "▸",
  blocked: "■",
  ready: "○",
  verified: "●",
};

const USAGE = `usage: bun dev/matrix.ts <matrix.toml> <command> [args]

  list [--status S] [--layer L]     the matrix
  get <ID>                          one row with its edges and review pointer
  add --id I --layer L --descriptor D   declare a row (always starts at todo, no proofs)
  set <ID> <status>                 todo | in_flight | blocked | ready   (fail-closed: see below)
  prove <ID> --host P               record the host proof pointer
  edge <ID> <path> <token>          record a proof edge — the token whose deletion removes it
  review <ID> <url>                 record the review pointer (a GitHub pull URL)
  verified <ID>                     DERIVE the verdict, clause by clause — it is never stored
  migrate                           retire target_proof lines into dated notes (old schema → new)
  set-layer <ID> <layer>            re-classify a row (kept in lockstep with its manifest unit)
  note <ID> "text"                  append a dated note
  check / earn / set-proof / require / invalidate / block / remedy
                                    earned-row v2 (review.ts = orchestrator subagents, max 3)
  unproven                          rows a consumer must treat as absent (derived, not stored)
  validate                          parse and cross-check
  selftest                          exercise the fail-closed rule and the derivation

FAIL-CLOSED: ready needs a host proof PLUS any require:* mandate receipts. verified is DERIVED:
ready ∧ every edge resolves in the current tree ∧ the latest completed ci run on main is green ∧
that run tested what main currently is ∧ a shape-valid review pointer. Offline the run leg is
unchecked, and unchecked is unproven. That refusal is why this file is worth trusting.`;

// ── commands ──────────────────────────────────────────────────────────────────────────────────

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function renderRow(lines: readonly string[], block: RowBlock): string {
  const { row } = block;
  const notes = lines
    .slice(block.start, block.end)
    .filter((line) => line.trimStart().startsWith("#"))
    .map((line) => `    ${line.trim()}`);

  const body = [
    `${MARK[row.status]} ${row.id}  [${row.status}]  layer=${row.layer}`,
    ``,
    `  ${row.descriptor}`,
    ``,
    `  host proof : ${row.hostProof === "" ? "(none)" : row.hostProof}`,
    `  edges      : ${row.edges.length === 0 ? "(none)" : `${row.edges.length} recorded`}`,
    ...row.edges.map((edge) => `    · ${edge.path} :: ${edge.token}`),
    `  review     : ${row.review === "" ? "(none)" : row.review}`,
  ];
  if (notes.length > 0) body.push(``, `  notes:`, ...notes);
  return body.join("\n");
}

// ── the derivation ────────────────────────────────────────────────────────────────────────────

/**
 * verified(row) ⟺ status == ready
 *               ∧ ≥1 edge recorded, and every edge resolves in the CURRENT tree    (offline)
 *               ∧ the latest completed ci run on main is a success                 (the forge)
 *               ∧ that run tested what main currently is — two values fetched at query time,
 *                 compared, and discarded
 *               ∧ a review pointer is present and shape-valid                      (offline)
 *
 * NOTHING SHA-SHAPED IS STORED. This repository force-pushes and squash-merges constantly; the
 * target proofs that cited commit e40b8e9 were orphaned by the squash-merge hours after they
 * were written. The comparison that survives rewriting is CONTENT — the run's head tree against
 * the main tip's tree. Commit shas never enter the file: a remembered run id is history, and
 * history lives in dated notes, depended on by nothing.
 */

/** The matrix's own repository root: the parent of the dev/ directory the matrix lives in. */
function repoRootOf(matrixPath: string): string {
  return dirname(dirname(resolve(matrixPath)));
}

/**
 * Does this edge still resolve in the CURRENT tree? Null when it does, else the reason. The same
 * checker runs at the write door (`edge`), at query time (`verified`), and at audit time
 * (`validate`) — one checker, three doors.
 */
async function resolveEdge(root: string, edge: Edge): Promise<string | null> {
  if (edge.path.includes("..")) {
    return `path "${edge.path}" climbs out of the repository — edges are repo-relative`;
  }
  const absolute = resolve(root, edge.path);
  if (absolute !== root && !absolute.startsWith(`${root}/`)) {
    return `path "${edge.path}" escapes the repository — edges are repo-relative`;
  }
  const file = Bun.file(absolute);
  if (!(await file.exists())) return `${edge.path} does not exist in the current tree`;
  const content = await file.text();
  if (!content.includes(edge.token)) {
    return `its token does not occur in ${edge.path} — the proof it named is gone`;
  }
  return null;
}

/** owner/repo for the matrix's own repository, from its git remote; null when underivable. */
async function deriveRepo(root: string): Promise<{ readonly owner: string; readonly repo: string } | null> {
  const url = (await Bun.$`git -C ${root} remote get-url origin`.quiet().nothrow().text()).trim();
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url) ??
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url);
  const owner = match?.[1] ?? "";
  const repo = match?.[2] ?? "";
  return owner === "" || repo === "" ? null : { owner, repo };
}

/**
 * The review pointer's shape: a GitHub pull URL — and, when the matrix's own remote is
 * derivable, one naming THIS repository. Shape only, deliberately: existence is a network
 * question, and the offline legs of this design are offline by construction.
 */
async function rejectReview(url: string, root: string): Promise<string | null> {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)([/?#]\S*)?$/.exec(url);
  if (match === null) {
    return (
      `"${url}" is not a GitHub pull URL — the review pointer names a review a later reader ` +
      `can open: https://github.com/<owner>/<repo>/pull/<number>`
    );
  }
  const repo = await deriveRepo(root);
  if (repo !== null && (match[1] !== repo.owner || match[2] !== repo.repo)) {
    return `the review points at ${match[1]}/${match[2]}, but this matrix belongs to ${repo.owner}/${repo.repo}`;
  }
  return null;
}

type RunLeg =
  | { readonly kind: "fetched"; readonly conclusion: string; readonly treeMatches: boolean; readonly label: string }
  | { readonly kind: "unchecked"; readonly why: string };

/**
 * THE RUN LEG. Two values, fetched fresh and discarded: the latest COMPLETED ci run on main
 * (forge run history is append-only — a force-push adds runs, it does not rewrite them), and the
 * main tip's tree. The comparison is CONTENT, not identity: rewrite the branch and the trees
 * still match; change the content and they do not.
 *
 * The two test seams are both fail-closed — they can only weaken the verdict, never strengthen
 * it: MATRIX_FORGE_OFFLINE=1 simulates no network; MATRIX_FORGE_FIXTURE=<file> substitutes a
 * recorded forge state for the live API.
 */
async function runLeg(root: string): Promise<RunLeg> {
  if ((process.env["MATRIX_FORGE_OFFLINE"] ?? "") === "1") {
    return { kind: "unchecked", why: "offline by MATRIX_FORGE_OFFLINE" };
  }

  const fixture = process.env["MATRIX_FORGE_FIXTURE"] ?? "";
  if (fixture !== "") {
    const data = (await Bun.file(fixture).json().catch(() => null)) as {
      readonly runs?: readonly Record<string, string>[];
      readonly main?: Record<string, string>;
    } | null;
    const run = (data?.runs ?? []).find(
      (candidate) => candidate["name"] === "ci" && candidate["status"] === "completed",
    );
    const mainTree = data?.main?.["tree"] ?? "";
    if (data === null || run === undefined || mainTree === "") {
      return { kind: "unchecked", why: `fixture ${fixture} is unreadable or carries no completed ci run` };
    }
    return {
      kind: "fetched",
      conclusion: run["conclusion"] ?? "",
      treeMatches: (run["tree"] ?? "") === mainTree,
      label: `run ${run["headSha"] ?? "?"} (fixture)`,
    };
  }

  const repo = await deriveRepo(root);
  if (repo === null) return { kind: "unchecked", why: `no github remote derivable for ${root}` };

  const token = process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"] ?? "";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agent-driven-architecture-matrix",
    ...(token === "" ? {} : { Authorization: `Bearer ${token}` }),
  };
  const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  try {
    const runsResp = await fetch(`${base}/actions/runs?branch=main&status=completed&per_page=30`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!runsResp.ok) return { kind: "unchecked", why: `the runs API answered ${runsResp.status}` };
    const runsData = (await runsResp.json()) as {
      readonly workflow_runs?: readonly {
        readonly name?: string;
        readonly status?: string;
        readonly conclusion?: string | null;
        readonly id?: number;
        readonly head_sha?: string;
        readonly head_commit?: { readonly tree_id?: string };
      }[];
    };
    const run = (runsData.workflow_runs ?? []).find(
      (candidate) => candidate.name === "ci" && candidate.status === "completed",
    );
    if (run === undefined) return { kind: "unchecked", why: "no completed ci run on main" };

    const tipResp = await fetch(`${base}/commits/heads/main`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!tipResp.ok) return { kind: "unchecked", why: `the commits API answered ${tipResp.status}` };
    const tip = (await tipResp.json()) as {
      readonly commit?: { readonly tree?: { readonly sha?: string } };
    };
    const runTree = run.head_commit?.tree_id ?? "";
    const tipTree = tip.commit?.tree?.sha ?? "";
    if (runTree === "" || tipTree === "") {
      return { kind: "unchecked", why: "the forge answered without tree ids" };
    }
    return {
      kind: "fetched",
      conclusion: run.conclusion ?? "",
      treeMatches: runTree === tipTree,
      label: `run ${run.id ?? "?"} on ${(run.head_sha ?? "?").slice(0, 9)}`,
    };
  } catch (error) {
    return {
      kind: "unchecked",
      why: `forge unreachable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

type Clause = {
  readonly name: "status" | "edges" | "run" | "tree" | "review";
  readonly state: "pass" | "fail" | "unchecked";
  readonly detail: string;
};

async function derive(
  root: string,
  row: Row,
  leg: RunLeg,
): Promise<{ readonly verified: boolean; readonly clauses: readonly Clause[] }> {
  const clauses: Clause[] = [];

  clauses.push(
    row.status === "ready"
      ? { name: "status", state: "pass", detail: "ready" }
      : { name: "status", state: "fail", detail: `stored status is "${row.status}" — ready is the only door` },
  );

  if (row.edges.length === 0) {
    clauses.push({
      name: "edges",
      state: "fail",
      detail: "no edges recorded — nothing machine-checked behind the row",
    });
  } else {
    const broken: string[] = [];
    for (const edge of row.edges) {
      const reason = await resolveEdge(root, edge);
      if (reason !== null) broken.push(reason);
    }
    clauses.push(
      broken.length === 0
        ? { name: "edges", state: "pass", detail: `${row.edges.length} recorded, all resolve in the current tree` }
        : { name: "edges", state: "fail", detail: broken.join("; ") },
    );
  }

  if (leg.kind === "unchecked") {
    clauses.push({ name: "run", state: "unchecked", detail: `unchecked — ${leg.why}` });
    clauses.push({ name: "tree", state: "unchecked", detail: "unchecked — the run leg did not answer" });
  } else {
    clauses.push(
      leg.conclusion === "success"
        ? { name: "run", state: "pass", detail: `latest completed ci run on main is green (${leg.label})` }
        : { name: "run", state: "fail", detail: `latest completed ci run on main concluded "${leg.conclusion}" (${leg.label})` },
    );
    clauses.push(
      leg.treeMatches
        ? { name: "tree", state: "pass", detail: "that run tested what main currently is" }
        : { name: "tree", state: "fail", detail: "that run tested a tree main no longer has" },
    );
  }

  if (row.review === "") {
    clauses.push({ name: "review", state: "fail", detail: "no review pointer recorded" });
  } else {
    const rejection = await rejectReview(row.review, root);
    clauses.push(
      rejection === null
        ? { name: "review", state: "pass", detail: row.review }
        : { name: "review", state: "fail", detail: rejection },
    );
  }

  return { verified: clauses.every((clause) => clause.state === "pass"), clauses };
}

const CLAUSE_MARK: Record<Clause["state"], string> = { pass: "✓", fail: "✗", unchecked: "□" };

function renderVerdict(
  id: string,
  verdict: { readonly verified: boolean; readonly clauses: readonly Clause[] },
): string {
  const headline = verdict.verified ? `● ${id} — verified` : `■ ${id} — NOT verified`;
  const lines = verdict.clauses.map(
    (clause) => `  ${CLAUSE_MARK[clause.state]} ${clause.name.padEnd(6)} : ${clause.detail}`,
  );
  return [headline, ...lines].join("\n");
}

function renderEdges(edges: readonly Edge[]): string {
  return `[ ${edges.map((edge) => `{ path = ${toml(edge.path)}, token = ${toml(edge.token)} }`).join(", ")} ]`;
}

const MATRIX_HEADER_V2 = `# ═══════════════════════════════════════════════════════════════════════════════════════════════
# AGENT-DRIVEN ARCHITECTURE — READINESS MATRIX (the PRESENT tense)
#
# One row per unit. Status advances ONLY when the named proof exists — fail-closed, enforced by
# dev/matrix.ts. Raw edits are hook-blocked; \`validate\` additionally catches a row hand-edited to
# claim a status it never earned.
#
#   bun dev/matrix.ts dev/matrix.toml list
#   bun dev/matrix.ts dev/matrix.toml prove <ID> --host <pointer>
#   bun dev/matrix.ts dev/matrix.toml set <ID> ready
#
# THE LADDER — the rungs anyone may set:
#   todo       declared in a manifest, nothing built
#   in_flight  someone is building it
#   blocked    needs a ruling — see the campaign item
#   ready      HOST PROOF exists: it builds and passes its gate on this machine
#
# verified IS NOT A RUNG ANYONE SETS — it is derived, fresh, at query time:
#   bun dev/matrix.ts dev/matrix.toml verified <ID>
# A row derives verified ⟺ it is ready AND every recorded edge (path+token) still resolves in the
# CURRENT tree AND the latest completed ci run on main is green AND that run tested what main
# currently is AND a review pointer is present and shape-valid. Nothing sha-shaped is stored: the
# two values compared are fetched at query time, compared, and discarded — so a force-push or a
# squash-merge that preserves content cannot flip the verdict (the e40b8e9 lesson). Offline the
# run leg reports UNCHECKED, and unchecked is unproven.
#
# What a row STORES for that derivation is only what cannot rot: edges (a test file plus the
# token whose deletion removes the proof — the laws.toml idiom) and a review URL. Run ids and
# commit shas are history: they live in dated notes, depended on by nothing.
#
# CONSUMERS READ THIS FILE. \`bun dev/matrix.ts dev/matrix.toml unproven\` lists what must be
# treated as absent. A capability stays invisible until its row is earned.
# ═══════════════════════════════════════════════════════════════════════════════════════════════`;

async function main(): Promise<number> {
  const argv = Bun.argv.slice(2);
  const matrixPath = argv[0];
  const command = argv[1];

  if (matrixPath === undefined || command === undefined || command === "help") {
    console.log(USAGE);
    return matrixPath === undefined ? 1 : 0;
  }
  if (command === "selftest") return await selftest();

  const rest = argv.slice(2);
  const lines = await readLines(matrixPath);
  const blocks = locateRows(lines);

  switch (command) {
    case "list": {
      const status = flag(rest, "status");
      const layer = flag(rest, "layer");
      const rows = blocks
        .map((block) => block.row)
        .filter((row) => status === null || row.status === status)
        .filter((row) => layer === null || row.layer === layer);
      if (rows.length === 0) {
        console.log("no matching rows");
        return 0;
      }
      const widest = Math.max(...rows.map((row) => row.id.length));
      for (const row of rows) {
        console.log(
          `${MARK[row.status]} ${row.id.padEnd(widest)}  ${row.status.padEnd(9)}  ${row.layer.padEnd(12)}  ${row.descriptor}`,
        );
      }
      console.log(
        `\n${rows.length} shown · ${ROW_STATUSES.map((candidate) => {
          const count = blocks.filter((block) => block.row.status === candidate).length;
          return count === 0 ? null : `${candidate} ${count}`;
        })
          .filter((entry) => entry !== null)
          .join(" · ")}`,
      );
      return 0;
    }

    case "get":
      console.log(renderRow(lines, findRow(blocks, rest[0] ?? "")));
      return 0;

    /**
     * New rows always start at `todo` with empty proofs. There is deliberately no way to mint a
     * row that is already `ready` or `verified` — a row must climb the ladder through `set`, and
     * `set` is where the fail-closed rule lives. An `add --status verified` flag would be a hole
     * straight through the only thing that makes this file trustworthy.
     */
    case "add": {
      const id = flag(rest, "id");
      const layer = flag(rest, "layer");
      const descriptor = flag(rest, "descriptor");
      if (id === null || layer === null || descriptor === null) {
        throw new LedgerError("add requires --id, --layer and --descriptor");
      }
      if (blocks.some((block) => block.row.id === id)) {
        throw new LedgerError(`row "${id}" already exists`);
      }
      await mutate(matrixPath, (current) => {
        const trimmed = [...current];
        while (trimmed.length > 0 && (trimmed.at(-1) ?? "").trim() === "") trimmed.pop();
        return [
          ...trimmed,
          ``,
          `[[rows]]`,
          `id = ${toml(id)}`,
          `layer = ${toml(layer)}`,
          `descriptor = ${toml(descriptor)}`,
          `status = "todo"`,
          `host_proof = ""`,
          ``,
        ];
      });
      console.log(`added ${id} (todo)`);
      return 0;
    }

    /**
     * Rows a consumer must treat as ABSENT. This is the executable half of the matrix: the build
     * reads it, so an unproven capability is invisible at runtime rather than merely undocumented.
     */
    case "unproven": {
      const root = repoRootOf(matrixPath);
      const leg = await runLeg(root);
      const absent: string[] = [];
      for (const block of blocks) {
        const verdict = await derive(root, block.row, leg);
        if (verdict.verified) continue;
        const missing = verdict.clauses
          .filter((clause) => clause.state !== "pass")
          .map((clause) => (clause.state === "unchecked" ? `${clause.name} (unchecked)` : clause.name));
        absent.push(`${block.row.id}\t${block.row.status}\t${missing.join(", ")}`);
      }
      if (absent.length === 0) {
        console.log("(none — every row derives verified)");
        return 0;
      }
      for (const line of absent) console.log(line);
      return 0;
    }

    case "set": {
      const id = rest[0] ?? "";
      const status = rest[1] ?? "";
      if (!isRowStatus(status)) throw new LedgerError(`"${status}" is not a row status`);

      if (status === "verified") {
        throw new LedgerError(
          `"verified" is derived, not set.\n\n` +
            `  It is computed fresh at query time, from facts that cannot rot:\n` +
            `    bun dev/matrix.ts ${matrixPath} edge <ID> <path> <token>   record a proof edge\n` +
            `    bun dev/matrix.ts ${matrixPath} review <ID> <url>          record the review pointer\n` +
            `    bun dev/matrix.ts ${matrixPath} verified <ID>                read the verdict, clause by clause\n\n` +
            `There is no override and no environment variable. The rung this replaces was ambient\n` +
            `authority guarding a WRITE, when the underlying question is whether a FACT holds.`,
        );
      }

      await mutate(matrixPath, (current) => {
        const block = findRow(locateRows(current), id);
        if (REQUIRED_PROOF[status] !== undefined && block.row.hostProof.trim() === "") {
          throw new LedgerError(
            `${id} cannot become "${status}": host_proof is empty.\n\n` +
              `This refusal is the point of the matrix. A status is a CLAIM, and a claim with ` +
              `no named artifact behind it is exactly what fail-closed exists to stop.\n\n` +
              `Record the proof first:\n` +
              `  bun dev/matrix.ts ${matrixPath} prove ${id} --host <pointer>`,
          );
        }
        assertStatusMandates(id, status, blockNotes(current, block), block.row.hostProof);
        return setField(current, block, "status", status);
      });
      console.log(`${id} → ${status}`);
      return 0;
    }

    case "prove": {
      const id = rest[0] ?? "";
      const host = flag(rest, "host");
      if (flag(rest, "target") !== null) {
        throw new LedgerError(
          `prove --target is gone. The environment-of-record proof is DERIVED at query time now:\n` +
            `  bun dev/matrix.ts ${matrixPath} verified <ID>\n` +
            `A remembered run id is history — if it matters, it lives in a dated note:\n` +
            `  bun dev/matrix.ts ${matrixPath} note <ID> "…"`,
        );
      }
      if (host === null) throw new LedgerError("prove: usage prove <ID> --host <pointer>");

      const rejection = rejectProof(host);
      if (rejection !== null) {
        throw new LedgerError(
          `--host ${rejection}\n\n` +
            `  good:  --host "bun run gate green @ 78f5051"\n` +
            `         --host "61/61 hook checks, ratchet 37/37, 2026-07-27"`,
        );
      }

      await mutate(matrixPath, (current) =>
        setField(current, findRow(locateRows(current), id), "host_proof", host),
      );
      console.log(`${id}: proof recorded`);
      return 0;
    }

    /**
     * THE EDGE DOOR. An edge names the artifact whose deletion removes the proof — a test file
     * and the declaration in it — and both halves must resolve at write time, because an edge
     * that never resolved is prose with a machine field's clothes. Re-resolved at query time and
     * by validate: one checker, three doors.
     */
    case "edge": {
      const id = rest[0] ?? "";
      const path = rest[1] ?? "";
      const token = rest.slice(2).join(" ").trim();
      if (id === "" || path === "" || token === "") {
        throw new LedgerError("edge: usage edge <ID> <path> <token>");
      }
      const root = repoRootOf(matrixPath);
      const rejection = await resolveEdge(root, { path, token });
      if (rejection !== null) throw new LedgerError(rejection);
      await mutate(matrixPath, (current) => {
        const block = findRow(locateRows(current), id);
        if (block.row.edges.some((edge) => edge.path === path && edge.token === token)) {
          throw new LedgerError(`${id}: edge already recorded`);
        }
        return setRawField(current, block, "edges", renderEdges([...block.row.edges, { path, token }]));
      });
      console.log(`${id}: edge recorded`);
      return 0;
    }

    /**
     * THE REVIEW DOOR. Per-row, not per-PR: one approval must not flip ten rows the reviewer
     * never read — the edges are what makes each row's proof independently falsifiable, and the
     * pointer is where the human read happened. Shape-checked here and again at query time.
     */
    case "review": {
      const id = rest[0] ?? "";
      const url = (rest[1] ?? "").trim();
      if (id === "" || url === "") throw new LedgerError("review: usage review <ID> <url>");
      const rejection = await rejectReview(url, repoRootOf(matrixPath));
      if (rejection !== null) throw new LedgerError(rejection);
      await mutate(matrixPath, (current) =>
        setField(current, findRow(locateRows(current), id), "review", url),
      );
      console.log(`${id}: review recorded`);
      return 0;
    }

    /** The verdict, clause by clause. Exit 0 only when every clause passes. */
    case "verified": {
      const id = rest[0] ?? "";
      if (id === "") throw new LedgerError("verified: usage verified <ID>");
      const block = findRow(blocks, id);
      const root = repoRootOf(matrixPath);
      const verdict = await derive(root, block.row, await runLeg(root));
      console.log(renderVerdict(id, verdict));
      return verdict.verified ? 0 : 1;
    }

    /**
     * THE SCHEMA DOOR, one-way. Every target_proof line is prose that named a run — history, not
     * evidence — so it moves to a dated note, and the header is rewritten to the derivation.
     * Idempotent, atomic (one mutate), and the only writer the header ever gets: the file's own
     * documentation of its schema changes with the schema, or the file contradicts itself.
     */
    case "migrate": {
      let retiredCount = 0;
      let headerRewrote = false;
      await mutate(matrixPath, (current) => {
        let next = [...current];
        // Bottom-up so earlier spans stay valid as lines move.
        for (const block of [...locateRows(next)].reverse()) {
          const relative = next
            .slice(block.start, block.end)
            .findIndex((line) => /^\s*target_proof\s*=/.test(line));
          if (relative === -1) continue;
          const value = scalar(next[block.start + relative] ?? "", "target_proof") ?? "";
          next.splice(block.start + relative, 1);
          retiredCount += 1;
          if (value.trim() !== "") {
            const after = findRow(locateRows(next), block.row.id);
            next.splice(
              after.end,
              0,
              `# ${today()} target proof retired by the derivation migration — prose that named ` +
                `a run; the run leg is derived fresh at query time now: ${value}`,
            );
          }
        }
        const firstTable = next.findIndex((line) => /^\s*\[/.test(line));
        const header = firstTable === -1 ? next : next.slice(0, firstTable);
        if (!header.some((line) => line.includes("IS NOT A RUNG"))) {
          next = [
            ...MATRIX_HEADER_V2.split("\n"),
            "",
            ...next.slice(firstTable === -1 ? next.length : firstTable),
          ];
          headerRewrote = true;
        }
        return next;
      });
      if (retiredCount === 0 && !headerRewrote) {
        console.log("migrate: nothing to migrate — already the derivation schema");
        return 0;
      }
      console.log(
        `migrate: retired ${retiredCount} target proof(s) into dated notes` +
          (headerRewrote ? "; header rewritten to the derivation" : ""),
      );
      return 0;
    }

    case "set-layer": {
      const id = rest[0] ?? "";
      const layer = rest[1] ?? "";
      if (layer === "") throw new LedgerError("set-layer: usage is set-layer <ID> <layer>");
      await mutate(matrixPath, (current) =>
        setField(current, findRow(locateRows(current), id), "layer", layer),
      );
      console.log(`${id}: layer = ${layer}`);
      return 0;
    }

    case "note": {
      const id = rest[0] ?? "";
      const text = rest[1] ?? "";
      if (text === "") throw new LedgerError("note text is required");
      await mutate(matrixPath, (current) => {
        const block = findRow(locateRows(current), id);
        const next = [...current];
        next.splice(block.end, 0, `# ${today()} ${text}`);
        return next;
      });
      console.log(`${id}: note appended`);
      return 0;
    }

    case "validate": {
      const parsed = parseOrThrow(lines.join("\n"), matrixPath) as {
        rows?: readonly Record<string, unknown>[];
      };
      const parsedRows = parsed.rows ?? [];
      if (parsedRows.length !== blocks.length) {
        throw new LedgerError(
          `line scan found ${blocks.length} rows but the parser found ${parsedRows.length}`,
        );
      }

      const root = repoRootOf(matrixPath);

      // The scanner and the parser must agree about every row's edges. A hand-edited multi-line
      // edges array scans as zero and parses as proof — one check plus a bypass.
      for (const [index, block] of blocks.entries()) {
        const parsedEdges = parsedRows[index]?.["edges"];
        const parsedEdgeCount = Array.isArray(parsedEdges) ? parsedEdges.length : 0;
        if (parsedEdgeCount !== block.row.edges.length) {
          throw new LedgerError(
            `${block.row.id}: the line scan found ${block.row.edges.length} edges but the parser ` +
              `found ${parsedEdgeCount} — the row was edited outside the CLI`,
          );
        }
      }

      for (const block of blocks) {
        // verified is DERIVED. A row storing it is the old permission model wearing the new
        // schema — demote it and let the derivation speak.
        if (block.row.status === "verified") {
          throw new LedgerError(
            `${block.row.id} stores status "verified" — verified is derived, not stored.\n` +
              `    Demote the row (set ${block.row.id} ready, if its proofs hold) and let the derivation speak.`,
          );
        }

        // target_proof is the old schema: prose receipts that named runs and shas. The
        // derivation stores neither — migrate retires the line into a dated note.
        const hasTargetProof = lines
          .slice(block.start, block.end)
          .some((line) => /^\s*target_proof\s*=/.test(line));
        if (hasTargetProof) {
          throw new LedgerError(
            `${block.row.id} carries a target_proof line — the old schema.\n` +
              `    Run: bun dev/matrix.ts ${matrixPath} migrate`,
          );
        }

        // Edges and the review pointer are re-checked here — the same checkers the write doors
        // run, or a hand-edit is one check plus a bypass.
        for (const edge of block.row.edges) {
          const reason = await resolveEdge(root, edge);
          if (reason !== null) {
            throw new LedgerError(
              `${block.row.id} records an edge that no longer resolves: ${reason}`,
            );
          }
        }
        if (block.row.review !== "") {
          const reason = await rejectReview(block.row.review, root);
          if (reason !== null) {
            throw new LedgerError(
              `${block.row.id} records a review pointer that fails its shape check: ${reason}`,
            );
          }
        }
      }

      /**
       * SAME CHECKER, TWICE. `validate` re-runs the SAME `rejectProof` the `prove` door runs.
       *
       * Previously this only checked for emptiness, so the two doors disagreed: `prove` refused
       * `--host "ok"`, while a row hand-edited to `host_proof = "ok"` sailed through the gate. A
       * front door that validates and a back door that does not is not two checks — it is one
       * check plus a bypass, and this repository's own doctrine says the checker must run at both.
       */
      for (const block of blocks) {
        if (REQUIRED_PROOF[block.row.status] === undefined) continue;
        const held = block.row.hostProof;

        if (held.trim() === "") {
          throw new LedgerError(
            `${block.row.id} claims "${block.row.status}" with an empty host_proof — the matrix was ` +
              `edited outside the CLI, which is the one way this file can be made to lie`,
          );
        }

        const rejection = rejectProof(held);
        if (rejection !== null) {
          throw new LedgerError(
            `${block.row.id} claims "${block.row.status}" but its host_proof ${rejection}\n\n` +
              `    The \`prove\` command would have refused this pointer, so the row was written by ` +
              `some other route.\n` +
              `    A status is only worth reading if its proof names something a later reader can ` +
              `go and check.`,
          );
        }
      }
      for (const block of blocks) {
        validateRowMandates(block.row.id, block.row.status, blockNotes(lines, block));
      }
      console.log(`${matrixPath}: valid · ${blocks.length} rows`);
      return 0;
    }

    default: {
      const handled = await handleEarnCommand(matrixPath, command, rest, {
        locateRows,
        findRow,
        setField,
        rejectProof,
        flag,
      });
      if (handled) return 0;
      console.error(`unknown command "${command}"\n\n${USAGE}`);
      return 1;
    }
  }
}

// ── selftest ──────────────────────────────────────────────────────────────────────────────────

async function selftest(): Promise<number> {
  const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");

  let failures = 0;
  let checks = 0;
  const check = (label: string, ok: boolean, detail = ""): void => {
    checks += 1;
    if (ok) return;
    failures += 1;
    console.error(`  FAIL  ${label}${detail === "" ? "" : `\n        ${detail}`}`);
  };

  /**
   * THE FIXTURE IS A TREE, not a bare file. Edges resolve against the matrix's own repository
   * root — the parent of its dev/ — so the fixture matrix sits in a fixture repo beside the test
   * file its edge names. A fixture that cannot resemble reality passes for reasons unrelated to
   * the property under test; this harness has paid for that lesson five times over.
   */
  const dir = mkdtempSync(`${tmpdir()}/eli-matrix-selftest-`);
  mkdirSync(`${dir}/dev`, { recursive: true });
  mkdirSync(`${dir}/examples/typescript/test/spine`, { recursive: true });

  const path = `${dir}/dev/matrix.toml`;
  const PROBE_RELPATH = "examples/typescript/test/spine/probe.test.ts";
  const PROBE_TOKEN = "G-probe — the wall holds";
  const probeFile = `${dir}/${PROBE_RELPATH}`;
  const PROBE_CONTENT = `describe("${PROBE_TOKEN}", () => {});\n`;
  await Bun.write(probeFile, PROBE_CONTENT);

  const REVIEW_URL = "https://github.com/torad-labs/agent-driven-architecture/pull/15";

  /**
   * THE FORGE FIXTURES. The run leg compares two values fetched fresh at query time — the latest
   * completed ci run's head tree against the main tip's tree — and stores neither. The two
   * success fixtures pin the case the old sha-shaped design could not survive: run commit ≠ tip
   * commit, SAME tree, verdict unchanged. `forcepush` is a rewritten branch; `squash` is PR #15's
   * e40b8e9, orphaned by the squash-merge hours after the target proofs cited it.
   */
  const forgePath = async (
    name: string,
    run: Record<string, string>,
    main: Record<string, string>,
  ): Promise<string> => {
    const file = `${dir}/dev/forge-${name}.json`;
    await Bun.write(file, JSON.stringify({ runs: [run], main }, null, 2));
    return file;
  };
  const FORCEPUSH = await forgePath(
    "forcepush",
    { name: "ci", status: "completed", conclusion: "success", headSha: "0a1b2c3d4e5f0001", tree: "tree-of-aa74" },
    { sha: "9f8e7d6c5b4a0002", tree: "tree-of-aa74" },
  );
  const SQUASH = await forgePath(
    "squash",
    { name: "ci", status: "completed", conclusion: "success", headSha: "e40b8e9cafe00001", tree: "tree-of-aa74" },
    { sha: "aa74e8b9cafe0002", tree: "tree-of-aa74" },
  );
  const FAILED_RUN = await forgePath(
    "failed",
    { name: "ci", status: "completed", conclusion: "failure", headSha: "aa74e8b9cafe0002", tree: "tree-of-aa74" },
    { sha: "aa74e8b9cafe0002", tree: "tree-of-aa74" },
  );

  await Bun.write(
    path,
    [
      `# selftest matrix`,
      ``,
      `[[rows]]`,
      `id = "R1"`,
      `layer = "loop"`,
      `descriptor = "a unit under test"`,
      `status = "todo"`,
      `host_proof = ""`,
      `# 2026-07-26 a pre-existing note that must survive`,
      ``,
    ].join("\n"),
  );

  /**
   * NO AMBIENT AUTHORITY IN THIS SUITE. The run helper strips every MATRIX_* variable from the
   * environment it hands the child, because the previous version of this file injected
   * MATRIX_ORCHESTRATOR=1 into every call — and a control only ever exercised in its permitted
   * state is indistinguishable from no control. What a case needs, it passes explicitly.
   */
  const run = async (
    args: readonly string[],
    env: Record<string, string> = {},
  ): Promise<{ out: string; exit: number }> => {
    const clean = { ...process.env };
    delete clean["MATRIX_ORCHESTRATOR"];
    delete clean["MATRIX_FORGE_FIXTURE"];
    delete clean["MATRIX_FORGE_OFFLINE"];
    const proc = Bun.spawn(["bun", import.meta.path, path, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...clean, ...env },
    });
    const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
    return { out, exit: await proc.exited };
  };

  console.log("matrix selftest");

  // THE FAIL-CLOSED RULE for the rungs that remain settable — the reason this file is trustworthy.
  check("ready is refused with no host proof", (await run(["set", "R1", "ready"])).out.includes("cannot become"));
  check("in_flight needs no proof", (await run(["set", "R1", "in_flight"])).out.includes("→ in_flight"));
  check(
    "a too-short proof pointer is refused",
    (await run(["prove", "R1", "--host", "ok"])).out.includes("too short"),
  );
  check(
    "a long but unresolvable pointer is refused",
    (await run(["prove", "R1", "--host", "yes it definitely works I checked it myself"])).out.includes("does not resolve"),
  );
  check(
    "a pointer naming a command and a sha is accepted",
    (await run(["prove", "R1", "--host", "bun run gate green @ 78f5051"])).out.includes("proof recorded"),
  );
  check("ready is permitted once the host proof exists", (await run(["set", "R1", "ready"])).out.includes("→ ready"));

  // WALL 6 — `verified` is not a rung anyone sets. It is derived, never written, and no
  // environment variable resurrects the old door.
  const setVerified = await run(["set", "R1", "verified"]);
  check(
    "set verified is a hard error naming the derivation doors",
    setVerified.exit !== 0 &&
      setVerified.out.includes("derived, not set") &&
      setVerified.out.includes("edge") &&
      setVerified.out.includes("review"),
    setVerified.out.slice(0, 200),
  );
  const setVerifiedWithEnv = await run(["set", "R1", "verified"], { MATRIX_ORCHESTRATOR: "1" });
  check(
    "no environment variable resurrects set-verified",
    setVerifiedWithEnv.exit !== 0 && setVerifiedWithEnv.out.includes("derived, not set"),
    setVerifiedWithEnv.out.slice(0, 200),
  );

  // THE EDGE DOOR — path+token, the laws.toml idiom: the token is the declaration whose deletion
  // removes the proof, and both halves are checked at write time AND again at query time.
  check(
    "an edge whose path does not exist is refused",
    (await run(["edge", "R1", "examples/typescript/test/spine/missing.test.ts", "x"])).out.includes("does not exist"),
  );
  check(
    "an edge whose token is absent is refused",
    (await run(["edge", "R1", PROBE_RELPATH, "a token that occurs nowhere"])).out.includes("does not occur"),
  );
  check(
    "an edge is recorded",
    (await run(["edge", "R1", PROBE_RELPATH, PROBE_TOKEN])).out.includes("edge recorded"),
  );
  check(
    "the same edge twice is refused",
    (await run(["edge", "R1", PROBE_RELPATH, PROBE_TOKEN])).out.includes("already recorded"),
  );

  // WALL 5 — the review door takes a shape a reviewer can have produced, and nothing else.
  check(
    "a non-GitHub URL is refused at review",
    (await run(["review", "R1", "https://example.com/not-a-pr"])).out.includes("not a GitHub pull URL"),
  );
  check(
    "a GitHub URL that is not a pull is refused",
    (await run(["review", "R1", "https://github.com/torad-labs/agent-driven-architecture"])).out.includes("not a GitHub pull URL"),
  );
  check(
    "a non-numeric pull number is refused",
    (await run(["review", "R1", "https://github.com/torad-labs/agent-driven-architecture/pull/abc"])).out.includes("not a GitHub pull URL"),
  );
  check("a real pull URL is recorded", (await run(["review", "R1", REVIEW_URL])).out.includes("review recorded"));

  // THE DERIVATION. R1 is now ready + one edge + one review — every leg provisioned.
  //
  // WALLS 1+2 — REWRITE-PROOF. Both success fixtures carry run sha ≠ tip sha with the SAME tree:
  // a force-push and a squash-merge each rewrite commit identity without touching content, and a
  // verdict that consulted commit shas (or worse, ancestry) would flip. The derivation compares
  // trees, fetched fresh and discarded.
  const forcepush = await run(["verified", "R1"], { MATRIX_FORGE_FIXTURE: FORCEPUSH });
  check(
    "WALL 1 force-push: run sha ≠ tip sha, same tree — verdict holds",
    forcepush.exit === 0 && forcepush.out.includes("— verified"),
    forcepush.out.slice(0, 300),
  );
  const squash = await run(["verified", "R1"], { MATRIX_FORGE_FIXTURE: SQUASH });
  check(
    "WALL 2 squash-merge: the cited commit is orphaned, the tree matches — verdict holds",
    squash.exit === 0 && squash.out.includes("— verified"),
    squash.out.slice(0, 300),
  );

  // WALL 3 — the run being green is load-bearing, independently of any tree comparison.
  const failedRun = await run(["verified", "R1"], { MATRIX_FORGE_FIXTURE: FAILED_RUN });
  check(
    "WALL 3 latest main run failed — NOT verified, run clause red",
    failedRun.exit !== 0 && failedRun.out.includes("✗ run"),
    failedRun.out.slice(0, 300),
  );

  // OFFLINE — the run leg reports unchecked, and unchecked is unproven.
  const offline = await run(["verified", "R1"], { MATRIX_FORGE_OFFLINE: "1" });
  check(
    "offline: the run leg reports unchecked, and unchecked is NOT verified",
    offline.exit !== 0 && offline.out.includes("□ run") && offline.out.includes("unchecked"),
    offline.out.slice(0, 300),
  );

  // WALL 4 — edges are re-resolved against the CURRENT tree at query time: delete the token from
  // its file and the row falls red offline, no forge consulted.
  await Bun.write(probeFile, `describe("the token is gone", () => {});\n`);
  const deletedToken = await run(["verified", "R1"], { MATRIX_FORGE_OFFLINE: "1" });
  check(
    "WALL 4 token deleted from its test file — edges clause red, offline",
    deletedToken.exit !== 0 && deletedToken.out.includes("✗ edges"),
    deletedToken.out.slice(0, 300),
  );
  await Bun.write(probeFile, PROBE_CONTENT);
  const restored = await run(["verified", "R1"], { MATRIX_FORGE_FIXTURE: FORCEPUSH });
  check("the verdict recovers when the token does", restored.exit === 0, restored.out.slice(0, 200));

  // THE VACUOUS-TRUTH GUARD. "Every edge resolves" is TRUE of zero edges, and that truth is a
  // hole: a row with no edges has nothing machine-checked behind it. The derivation requires ≥1.
  await run(["add", "--id", "R2", "--layer", "loop", "--descriptor", "a second unit"]);
  await run(["prove", "R2", "--host", "bun run gate green @ 78f5051"]);
  await run(["set", "R2", "ready"]);
  await run(["review", "R2", REVIEW_URL]);
  const edgeless = await run(["verified", "R2"], { MATRIX_FORGE_FIXTURE: FORCEPUSH });
  check(
    "no edges recorded — NOT verified even with a green run behind it",
    edgeless.exit !== 0 && edgeless.out.includes("✗ edges"),
    edgeless.out.slice(0, 300),
  );

  // UNPROVEN — the consumer's read. Offline every row is unproven; with a green forge only the
  // under-provisioned row remains.
  check(
    "unproven lists even the fully provisioned row while the run leg is unchecked",
    (await run(["unproven"], { MATRIX_FORGE_OFFLINE: "1" })).out.includes("R1"),
  );
  const onlineUnproven = await run(["unproven"], { MATRIX_FORGE_FIXTURE: FORCEPUSH });
  check(
    "unproven online: R1 derives verified and drops off; R2 stays",
    !onlineUnproven.out.includes("R1") && onlineUnproven.out.includes("R2"),
    onlineUnproven.out.slice(0, 300),
  );

  // VALIDATE — the same checkers, at the back door too.
  check("validate passes on the provisioned matrix", (await run(["validate"])).out.includes("valid"));

  const provisioned = await Bun.file(path).text();
  const storedVerified = provisioned.replace('status = "ready"', 'status = "verified"');
  if (storedVerified === provisioned) throw new Error("selftest fixture drifted: no ready status to flip");
  await Bun.write(path, storedVerified);
  const storedVerdict = await run(["validate"]);
  check(
    "a hand-edited STORED verified is refused — derived, not stored",
    storedVerdict.out.includes("derived, not stored"),
    storedVerdict.out.slice(0, 300),
  );
  await Bun.write(path, provisioned);
  check("validate passes again once the earned status is restored", (await run(["validate"])).out.includes("valid"));

  // MIGRATE — target_proof was the old plane's prose receipt; the derivation stores nothing of
  // the sort. A row still carrying one is the old schema, and the door forward is migrate.
  const withTarget = provisioned.replace(
    'host_proof = "bun run gate green @ 78f5051"',
    'host_proof = "bun run gate green @ 78f5051"\ntarget_proof = "CI run 31284161862 @ commit e40b8e9 — npm test PASS"',
  );
  if (withTarget === provisioned) throw new Error("selftest fixture drifted: host proof line not found");
  await Bun.write(path, withTarget);
  const staleSchema = await run(["validate"]);
  check(
    "a target_proof line is the old schema — validate names the door",
    staleSchema.out.includes("migrate"),
    staleSchema.out.slice(0, 300),
  );
  const migrated = await run(["migrate"]);
  check("migrate retires the target proof", migrated.exit === 0 && migrated.out.includes("retired 1"), migrated.out.slice(0, 200));
  const afterMigrate = await Bun.file(path).text();
  check("the target_proof line is gone", !afterMigrate.includes("target_proof"));
  check("the receipt survives as a dated note", afterMigrate.includes("31284161862") && afterMigrate.includes(`# ${today()}`));
  check("migrate is idempotent", (await run(["migrate"])).out.includes("nothing to migrate"));
  check("validate passes after migration", (await run(["validate"])).out.includes("valid"));

  // The old fail-closed behaviours that have nothing to do with the derivation.
  const emptyHost = afterMigrate.replace('host_proof = "bun run gate green @ 78f5051"', 'host_proof = ""');
  if (emptyHost === afterMigrate) throw new Error("selftest fixture drifted: host proof not found post-migrate");
  await Bun.write(path, emptyHost);
  check("validate catches a hand-edited EMPTY host proof", (await run(["validate"])).out.includes("edited outside the CLI"));
  await Bun.write(path, afterMigrate);
  check("validate passes with the earned proof restored", (await run(["validate"])).out.includes("valid"));

  check("pre-existing notes survive every write", (await Bun.file(path).text()).includes("must survive"));

  // earned-row v2 (the unchanged plane, still witnessed here)
  check(
    "set-proof attested works",
    (await run(["set-proof", "R1", "manual", "bun run gate green @ deadbeef01"])).out.includes("attested"),
  );
  await run(["check", "R1", "unit", "--cmd", "true"]);
  check(
    "set-proof refuses executed slug",
    (await run(["set-proof", "R1", "unit", "bun run gate green @ abcdef12"])).out.includes("refused"),
  );
  check("earn unit ok", (await run(["earn", "R1", "unit"])).out.includes("exit=0"));
  await run(["require", "R1", "ready", "unit"]);
  await run(["set", "R1", "in_flight"]);
  await run(["prove", "R1", "--host", "bun run gate green @ 78f5051"]);
  check("ready with mandate", (await run(["set", "R1", "ready"])).out.includes("→ ready"));
  check("block needs evidence", (await run(["set", "R1", "blocked"])).out.includes("block"));
  check(
    "block with probe",
    (await run(["block", "R1", "--symptom", "x", "--unblocks", "y", "--probe", "true"])).out.includes("blocked"),
  );

  rmSync(dir, { recursive: true, force: true });

  console.log(`${checks - failures}/${checks} checks passed`);
  return failures > 0 ? 1 : 0;
}

try {
  process.exit(await main());
} catch (error) {
  if (error instanceof LedgerError) {
    console.error(`matrix: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
