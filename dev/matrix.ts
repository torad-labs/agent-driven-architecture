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
 * FAIL-CLOSED IS THE ENTIRE POINT. `ready` requires a host proof; `verified` requires a proof on
 * the environment of record. Without that rule this is a checklist, and a checklist is something
 * an agent can tick. With it, the matrix is an INPUT the build reads — consumers gate on row
 * status, so an unproven capability stays invisible at runtime and a claim not derived from an
 * earned row cannot ship. You cannot lie to it, which is what makes it worth keeping.
 */

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
const REQUIRED_PROOF: Partial<Record<RowStatus, "host_proof" | "target_proof">> = {
  ready: "host_proof",
  verified: "target_proof",
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
 * `verified` IS ORCHESTRATOR-ONLY.
 *
 * `done` means a builder claims it landed. `verified` means the orchestrator independently re-ran
 * the gates, read the diff and confirmed against the packet. Collapsing the two is how a campaign
 * starts believing its own reports.
 *
 * Enforced by an environment variable rather than cryptography, and that limit is stated plainly:
 * on a NOPASSWD host a builder that wants to set it can. What this buys is that doing so is a
 * deliberate, self-incriminating act rather than the default path — the same currency the rest of
 * this harness trades in.
 */
const ORCHESTRATOR_ENV = "MATRIX_ORCHESTRATOR";

export type Row = {
  readonly id: string;
  readonly layer: string;
  readonly descriptor: string;
  readonly status: RowStatus;
  readonly hostProof: string;
  readonly targetProof: string;
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

    blocks.push({
      start: index,
      end: last,
      row: {
        id: pick("id"),
        layer: pick("layer"),
        descriptor: pick("descriptor"),
        status: isRowStatus(rawStatus) ? rawStatus : "todo",
        hostProof: pick("host_proof"),
        targetProof: pick("target_proof"),
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

const MARK: Record<RowStatus, string> = {
  todo: "·",
  in_flight: "▸",
  blocked: "■",
  ready: "○",
  verified: "●",
};

const USAGE = `usage: bun dev/matrix.ts <matrix.toml> <command> [args]

  list [--status S] [--layer L]     the matrix
  get <ID>                          one row with its proofs
  add --id I --layer L --descriptor D   declare a row (always starts at todo, no proofs)
  set <ID> <status>                 ${ROW_STATUSES.join(" | ")}   (fail-closed: see below)
  prove <ID> --host P               record the host proof pointer
  prove <ID> --target P             record the environment-of-record proof pointer
  set-layer <ID> <layer>            re-classify a row (kept in lockstep with its manifest unit)
  note <ID> "text"                  append a dated note
  check / earn / set-proof / require / invalidate / block / remedy
                                    earned-row v2 (review.ts = orchestrator subagents, max 3)
  unproven                          rows a consumer must treat as absent
  validate                          parse and cross-check
  selftest                          exercise the fail-closed rule

FAIL-CLOSED: ready/verified need host/target proofs PLUS any require:* mandate receipts.
Executed slugs only via earn; set-proof refused on them. review-clean = orchestrator subagents
(max 3, >=2 clean). block needs evidence. That refusal is why this file is worth trusting.`;

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
    `  host proof   : ${row.hostProof === "" ? "(none)" : row.hostProof}`,
    `  target proof : ${row.targetProof === "" ? "(none)" : row.targetProof}`,
  ];
  if (notes.length > 0) body.push(``, `  notes:`, ...notes);
  return body.join("\n");
}

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
          `target_proof = ""`,
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
      const rows = blocks.filter((block) => block.row.status !== "verified").map((b) => b.row);
      if (rows.length === 0) {
        console.log("(none — every row is proven on the environment of record)");
        return 0;
      }
      for (const row of rows) console.log(`${row.id}\t${row.status}\t${row.descriptor}`);
      return 0;
    }

    case "set": {
      const id = rest[0] ?? "";
      const status = rest[1] ?? "";
      if (!isRowStatus(status)) throw new LedgerError(`"${status}" is not a row status`);

      if (status === "verified" && (process.env[ORCHESTRATOR_ENV] ?? "") !== "1") {
        throw new LedgerError(
          `"verified" is the orchestrator's word, not a builder's.\n\n` +
            `  done      a builder claims it landed\n` +
            `  verified  the orchestrator independently re-ran the gates, read the diff, and\n` +
            `            confirmed against the packet\n\n` +
            `Collapsing those is how a campaign starts believing its own reports. If you ARE the\n` +
            `orchestrator, re-run with ${ORCHESTRATOR_ENV}=1 set inline.\n\n` +
            `Stated plainly: on a NOPASSWD host a builder that wants to set this can. What the\n` +
            `check buys is that doing so is deliberate and self-incriminating rather than the\n` +
            `default path.`,
        );
      }

      await mutate(matrixPath, (current) => {
        const block = findRow(locateRows(current), id);
        const needed = REQUIRED_PROOF[status];
        if (needed !== undefined) {
          const held = needed === "host_proof" ? block.row.hostProof : block.row.targetProof;
          if (held.trim() === "") {
            throw new LedgerError(
              `${id} cannot become "${status}": ${needed} is empty.\n\n` +
                `This refusal is the point of the matrix. A status is a CLAIM, and a claim with ` +
                `no named artifact behind it is exactly what fail-closed exists to stop.\n\n` +
                `Record the proof first:\n` +
                `  bun dev/matrix.ts ${matrixPath} prove ${id} --${needed === "host_proof" ? "host" : "target"} <pointer>`,
            );
          }
        }
        assertStatusMandates(
          id,
          status,
          blockNotes(current, block),
          block.row.hostProof,
          block.row.targetProof,
        );
        return setField(current, block, "status", status);
      });
      console.log(`${id} → ${status}`);
      return 0;
    }

    case "prove": {
      const id = rest[0] ?? "";
      const host = flag(rest, "host");
      const target = flag(rest, "target");
      if (host === null && target === null) throw new LedgerError("pass --host or --target");

      for (const [flagName, pointer] of [["--host", host], ["--target", target]] as const) {
        if (pointer === null) continue;
        const rejection = rejectProof(pointer);
        if (rejection !== null) {
          throw new LedgerError(
            `${flagName} ${rejection}\n\n` +
              `  good:  --host "bun run gate green @ 78f5051"\n` +
              `         --host "61/61 hook checks, ratchet 37/37, 2026-07-27"\n` +
              `         --target "device receipt sha256:deadbeef42 on torad-server 2026-07-27"`,
          );
        }
      }

      await mutate(matrixPath, (current) => {
        let next = [...current];
        if (host !== null) next = setField(next, findRow(locateRows(next), id), "host_proof", host);
        if (target !== null) {
          next = setField(next, findRow(locateRows(next), id), "target_proof", target);
        }
        return next;
      });
      console.log(`${id}: proof recorded`);
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
      const parsed = parseOrThrow(lines.join("\n"), matrixPath) as { rows?: unknown[] };
      const parsedCount = Array.isArray(parsed.rows) ? parsed.rows.length : 0;
      if (parsedCount !== blocks.length) {
        throw new LedgerError(
          `line scan found ${blocks.length} rows but the parser found ${parsedCount}`,
        );
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
        const needed = REQUIRED_PROOF[block.row.status];
        if (needed === undefined) continue;
        const held = needed === "host_proof" ? block.row.hostProof : block.row.targetProof;

        if (held.trim() === "") {
          throw new LedgerError(
            `${block.row.id} claims "${block.row.status}" with an empty ${needed} — the matrix was ` +
              `edited outside the CLI, which is the one way this file can be made to lie`,
          );
        }

        const rejection = rejectProof(held);
        if (rejection !== null) {
          throw new LedgerError(
            `${block.row.id} claims "${block.row.status}" but its ${needed} ${rejection}\n\n` +
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
  const path = `${process.env["TMPDIR"] ?? "/tmp"}/eli-matrix-selftest-${process.pid}.toml`;
  let failures = 0;
  let checks = 0;

  const check = (label: string, ok: boolean, detail = ""): void => {
    checks += 1;
    if (ok) return;
    failures += 1;
    console.error(`  FAIL  ${label}${detail === "" ? "" : `\n        ${detail}`}`);
  };

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
      `target_proof = ""`,
      `# 2026-07-26 a pre-existing note that must survive`,
      ``,
    ].join("\n"),
  );

  /**
   * The suite speaks with the orchestrator's authority by default, because most of what it
   * exercises is the fail-closed PROOF rule rather than the authority rule. The authority rule
   * gets its own dedicated case below, run deliberately WITHOUT the variable — otherwise setting
   * it here would mask the very control it was added to provide.
   */
  const run = async (...args: string[]): Promise<string> => {
    const proc = Bun.spawn(["bun", import.meta.path, path, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MATRIX_ORCHESTRATOR: "1" },
    });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    await proc.exited;
    return out + err;
  };

  console.log("matrix selftest");

  // THE FAIL-CLOSED RULE — the reason this file is trustworthy at all.
  check("ready is refused with no host proof", (await run("set", "R1", "ready")).includes("cannot become"));
  check("verified is refused with no target proof", (await run("set", "R1", "verified")).includes("cannot become"));
  check("in_flight needs no proof", (await run("set", "R1", "in_flight")).includes("→ in_flight"));

  await run("prove", "R1", "--host", "bun test ok @ abc123");
  check("ready is permitted once the host proof exists", (await run("set", "R1", "ready")).includes("→ ready"));
  check("verified is STILL refused — host proof is not target proof", (await run("set", "R1", "verified")).includes("cannot become"));

  await run("prove", "R1", "--target", "device receipt sha256:deadbeef 2026-07-26");
  check("verified is permitted once the target proof exists", (await run("set", "R1", "verified")).includes("→ verified"));

  check("unproven excludes a verified row", !(await run("unproven")).includes("R1"));
  check("validate passes", (await run("validate")).includes("valid"));

  // ── the authority rule, exercised WITHOUT the orchestrator variable ──────────────────────────
  // On THIS ladder `ready` is the builder's top rung — it builds and passes its gate on this
  // machine. `verified` is the orchestrator's: independently re-ran, diff read, confirmed on the
  // environment of record. Collapsing them is how a campaign starts believing its own reports.
  //
  // (`done` belongs to the campaign LEDGER's ladder, not this one. Writing it here is what the
  //  first version of this test did, and the test correctly refused it.)
  //
  // Run deliberately without MATRIX_ORCHESTRATOR, because the shared `run` helper sets it — a
  // control only ever exercised in its permitted state is indistinguishable from no control.
  const runAsBuilder = async (...args: string[]): Promise<string> => {
    const env = { ...process.env };
    delete env["MATRIX_ORCHESTRATOR"];
    const proc = Bun.spawn(["bun", import.meta.path, path, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env,
    });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    await proc.exited;
    return out + err;
  };

  check(
    "a builder CAN set the rungs below verified",
    (await runAsBuilder("set", "R1", "ready")).includes("→ ready"),
  );
  check(
    "a builder cannot set verified — even with both proofs already recorded",
    (await runAsBuilder("set", "R1", "verified")).includes("orchestrator's word"),
  );
  check(
    "the refused attempt wrote nothing — the row is still ready",
    (await run("get", "R1")).includes("[ready]"),
  );
  check(
    "the orchestrator can set verified",
    (await run("set", "R1", "verified")).includes("→ verified"),
  );

  // ── the proof validator: a pointer must resolve to something a later reader can check ─────────
  check(
    "a too-short proof pointer is refused",
    (await run("prove", "R1", "--host", "ok")).includes("too short"),
  );
  check(
    "a long but unresolvable pointer is refused",
    (await run("prove", "R1", "--host", "yes it definitely works I checked it myself")).includes(
      "does not resolve",
    ),
  );
  check(
    "a pointer naming a command and a sha is accepted",
    (await run("prove", "R1", "--host", "bun run gate green @ 78f5051")).includes("proof recorded"),
  );

  const text = await Bun.file(path).text();
  check("pre-existing notes survive every write", text.includes("must survive"));

  // A row hand-edited to claim a status it has not earned must be caught by validate — otherwise
  // the CLI-only rule is advisory and the matrix can be made to lie by anyone with an editor.
  const earnedTarget = 'target_proof = "device receipt sha256:deadbeef 2026-07-26"';
  if (!text.includes(earnedTarget)) throw new Error("selftest fixture drifted: earned target_proof not found");
  await Bun.write(path, text.replace(earnedTarget, 'target_proof = ""'));
  check("validate catches a hand-edited EMPTY proof", (await run("validate")).includes("edited outside the CLI"));

  // SAME CHECKER, TWICE. `prove` refuses a junk pointer; `validate` must refuse it too, or the
  // front door validates while the back door does not — which is one check plus a bypass.
  await Bun.write(path, text.replace(earnedTarget, 'target_proof = "ok"'));
  check(
    "validate re-runs the proof validator on a hand-edited JUNK pointer",
    (await run("validate")).includes("too short"),
  );
  await Bun.write(path, text);
  check("validate passes again once the earned proof is restored", (await run("validate")).includes("valid"));

  // earned-row v2
  check(
    "set-proof attested works",
    (await run("set-proof", "R1", "manual", "bun run gate green @ deadbeef01")).includes("attested"),
  );
  await run("check", "R1", "unit", "--cmd", "true");
  check(
    "set-proof refuses executed slug",
    (await run("set-proof", "R1", "unit", "bun run gate green @ abcdef12")).includes("refused"),
  );
  check("earn unit ok", (await run("earn", "R1", "unit")).includes("exit=0"));
  await run("require", "R1", "ready", "unit");
  await run("set", "R1", "in_flight");
  await run("prove", "R1", "--host", "bun run gate green @ 78f5051");
  check("ready with mandate", (await run("set", "R1", "ready")).includes("→ ready"));
  check(
    "block needs evidence",
    (await run("set", "R1", "blocked")).includes("block"),
  );
  check(
    "block with probe",
    (await run("block", "R1", "--symptom", "x", "--unblocks", "y", "--probe", "true")).includes("blocked"),
  );


  await Bun.file(path).delete().catch(() => {});
  await Bun.file(`${path}.lock`).delete().catch(() => {});

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
