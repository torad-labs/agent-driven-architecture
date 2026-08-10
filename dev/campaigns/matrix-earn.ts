/**
 * Earned-row v2 verbs for the matrix (HARNESS-2/4).
 * Loaded by matrix.ts when present — keeps diary-marker logic out of the base CLI core.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  LedgerError,
  mutate,
  readLines,
  today,
} from "./ledger-core.ts";
import {
  MAX_REVIEWS_PER_TARGET,
  artifactDir,
  formatAttestedReceipt,
  formatCheckNote,
  formatExecutedReceipt,
  formatRequireNote,
  isoNow,
  missingSlugs,
  parseBlockEvidence,
  parseChecks,
  parseReceipts,
  parseRequires,
  parseReviews,
  teachRemedy,
  type DeclaredCheck,
} from "./earn-core.ts";

export type RowBlock = {
  readonly row: {
    readonly id: string;
    readonly status: string;
    readonly hostProof: string;
    readonly targetProof: string;
  };
  readonly start: number;
  readonly end: number;
};

export type MatrixEarnApi = {
  // Structural any: matrix RowBlock is a superset; avoid dual-type friction.
  locateRows: (lines: readonly string[]) => any[];
  findRow: (blocks: readonly any[], id: string) => any;
  setField: (
    lines: readonly string[],
    block: any,
    key: string,
    value: string,
  ) => string[];
  rejectProof: (pointer: string) => string | null;
  flag: (argv: readonly string[], name: string) => string | null;
};

function blockNotes(lines: readonly string[], block: any): string[] {
  return lines
    .slice(block.start, block.end)
    .filter((line) => line.trimStart().startsWith("#"))
    .map((line) => line.trim());
}

function appendNote(lines: readonly string[], block: any, note: string): string[] {
  const next = [...lines];
  next.splice(block.end, 0, note);
  return next;
}

function replaceCheck(
  lines: readonly string[],
  block: any,
  slug: string,
  note: string,
): string[] {
  const next = [...lines];
  const re = new RegExp(
    `^#\\s*check:${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
  );
  for (let i = block.start; i < block.end; i++) {
    if (re.test((next[i] ?? "").trim())) {
      const old = next[i];
      next[i] = note;
      next.splice(block.end, 0, `# ${today()} check replace ${slug}: ${old} → ${note}`);
      return next;
    }
  }
  return appendNote(next, block, note);
}

export async function handleEarnCommand(
  matrixPath: string,
  command: string,
  rest: readonly string[],
  api: MatrixEarnApi,
): Promise<boolean> {
  const { locateRows, findRow, setField, rejectProof, flag } = api;

  if (command === "check") {
    const id = rest[0] ?? "";
    const slug = rest[1] ?? "";
    if (!id || !slug) {
      throw new LedgerError(
        "check: usage check <ID> <slug> --cmd … | --via review | --attested",
      );
    }
    const viaReview =
      rest.includes("--via") && rest[rest.indexOf("--via") + 1] === "review";
    const attested = rest.includes("--attested");
    const cmd = flag(rest, "cmd");
    let decl: DeclaredCheck;
    if (viaReview) decl = { slug, kind: "executed", via: "review" };
    else if (attested) decl = { slug, kind: "attested" };
    else {
      if (!cmd) throw new LedgerError('check: need --cmd "…" for executed slug');
      decl = { slug, kind: "executed", cmd };
    }
    await mutate(matrixPath, (current) => {
      const block = findRow(locateRows(current), id);
      return replaceCheck(current, block, slug, formatCheckNote(decl));
    });
    console.log(
      `${id}: check ${slug} declared (${decl.kind}${decl.via ? " via=review" : ""})`,
    );
    return true;
  }

  if (command === "require") {
    const id = rest[0] ?? "";
    const status = rest[1] ?? "";
    const slugsRaw = rest[2] ?? "";
    if (status !== "ready" && status !== "verified") {
      throw new LedgerError("require: usage require <ID> ready|verified <slug[,…]>");
    }
    const slugs = slugsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!id || slugs.length === 0) throw new LedgerError("require: need id and slugs");
    await mutate(matrixPath, (current) => {
      const block = findRow(locateRows(current), id);
      const notes = blockNotes(current, block);
      const req = parseRequires(notes);
      const bucket = status === "ready" ? req.ready : req.verified;
      const merged = [...new Set([...bucket, ...slugs])];
      const next = [...current];
      const re = new RegExp(`^#\\s*require:${status}:`);
      let replaced = false;
      for (let i = block.start; i < block.end; i++) {
        if (re.test((next[i] ?? "").trim())) {
          next[i] = formatRequireNote(status, merged);
          replaced = true;
          break;
        }
      }
      if (!replaced) next.splice(block.end, 0, formatRequireNote(status, merged));
      const b2 = findRow(locateRows(next), id);
      const n2 = blockNotes(next, b2);
      const want =
        status === "ready" ? parseRequires(n2).ready : parseRequires(n2).verified;
      const miss = missingSlugs(
        want,
        parseChecks(n2),
        parseReceipts(n2),
        parseReviews(n2),
      );
      const st = b2.row.status;
      if (
        miss.length > 0 &&
        ((status === "ready" && (st === "ready" || st === "verified")) ||
          (status === "verified" && st === "verified"))
      ) {
        let dem = setField(next, b2, "status", "in_flight");
        const b3 = findRow(locateRows(dem), id);
        dem = appendNote(
          dem,
          b3,
          `# ${today()} require demoted ${st}→in_flight: missing ${miss
            .map((m) => m.slug)
            .join(",")}`,
        );
        return dem;
      }
      return next;
    });
    console.log(`${id}: require ${status} += ${slugs.join(",")}`);
    return true;
  }

  if (command === "set-proof") {
    const id = rest[0] ?? "";
    const slug = rest[1] ?? "";
    const pointer = rest.slice(2).join(" ").trim();
    if (!id || !slug || !pointer) {
      throw new LedgerError("set-proof: usage set-proof <ID> <slug> <pointer>");
    }
    const rejection = rejectProof(pointer);
    if (rejection) throw new LedgerError(`set-proof pointer ${rejection}`);
    await mutate(matrixPath, (current) => {
      const block = findRow(locateRows(current), id);
      const checks = parseChecks(blockNotes(current, block));
      const decl = checks.find((c) => c.slug === slug);
      if (decl?.kind === "executed" || decl?.via === "review") {
        throw new LedgerError(
          `set-proof refused for executed slug "${slug}".\n` +
            `  Use: bun dev/matrix.ts ${matrixPath} earn ${id} ${slug}` +
            (decl.via === "review"
              ? "\n  (review-clean: bun dev/campaigns/review.ts — orchestrator subagents)"
              : `\n  cmd: ${decl.cmd}`),
        );
      }
      return appendNote(
        current,
        block,
        formatAttestedReceipt(slug, isoNow(), pointer),
      );
    });
    console.log(`${id}: attested receipt for ${slug}`);
    return true;
  }

  if (command === "earn") {
    const id = rest[0] ?? "";
    const only = rest[1];
    if (!id) throw new LedgerError("earn: usage earn <ID> [slug]");
    const root = (
      await Bun.$`git rev-parse --show-toplevel`.text()
    ).trim();
    const dir = artifactDir(root, "earn");
    mkdirSync(dir, { recursive: true });
    const linesNow = await readLines(matrixPath);
    const block0 = findRow(locateRows(linesNow), id);
    const notes0 = blockNotes(linesNow, block0);
    let checks = parseChecks(notes0).filter(
      (c) => c.kind === "executed" && c.via !== "review",
    );
    if (only) checks = checks.filter((c) => c.slug === only);

    if (
      checks.length === 0 &&
      (only === "review-clean" ||
        parseChecks(notes0).some((c) => c.slug === "review-clean" || c.via === "review"))
    ) {
      const sat = parseReviews(notes0);
      const { ok, detail } = (
        await import("./earn-core.ts")
      ).reviewCleanSatisfied(sat);
      if (!ok) throw new LedgerError(`earn review-clean refused: ${detail}`);
      const art = `${dir}/${id}-review-clean.txt`;
      writeFileSync(art, `review-clean ok ${detail} ${isoNow()}\n`);
      await mutate(matrixPath, (current) => {
        const block = findRow(locateRows(current), id);
        return appendNote(
          current,
          block,
          formatExecutedReceipt("review-clean", isoNow(), 0, art),
        );
      });
      console.log(`${id}: earned review-clean → ${art}`);
      return true;
    }

    if (checks.length === 0) {
      throw new LedgerError(
        `${id}: no executed checks to earn${only ? ` for ${only}` : ""}`,
      );
    }

    for (const c of checks) {
      if (!c.cmd) throw new LedgerError(`check ${c.slug} has no cmd`);
      const art = `${dir}/${id}-${c.slug.replace(/[^A-Za-z0-9._-]/g, "_")}.txt`;
      const proc = Bun.spawn(["bash", "-lc", c.cmd], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exit = await proc.exited;
      writeFileSync(
        art,
        `$ ${c.cmd}\nexit ${exit}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`,
      );
      await mutate(matrixPath, (current) => {
        const block = findRow(locateRows(current), id);
        return appendNote(
          current,
          block,
          formatExecutedReceipt(c.slug, isoNow(), exit, art),
        );
      });
      console.log(`${id}: earn ${c.slug} exit=${exit} artifact=${art}`);
      if (exit !== 0) {
        throw new LedgerError(
          `earn ${c.slug} failed (exit ${exit}) — receipt kept; fix forward and re-earn`,
        );
      }
    }
    const lines3 = await readLines(matrixPath);
    const b3 = findRow(locateRows(lines3), id);
    const n3 = blockNotes(lines3, b3);
    console.log(
      teachRemedy(
        id,
        "ready",
        missingSlugs(
          parseRequires(n3).ready,
          parseChecks(n3),
          parseReceipts(n3),
          parseReviews(n3),
        ),
      ),
    );
    return true;
  }

  if (command === "invalidate") {
    const id = rest[0] ?? "";
    const reason = flag(rest, "reason") ?? rest.slice(1).join(" ");
    if (!id || !reason) {
      throw new LedgerError('invalidate: usage invalidate <ID> --reason "…"');
    }
    await mutate(matrixPath, (current) => {
      const block = findRow(locateRows(current), id);
      let next = setField(current, block, "status", "in_flight");
      const b2 = findRow(locateRows(next), id);
      return appendNote(next, b2, `# ${today()} invalidate: ${reason}`);
    });
    console.log(`${id} → in_flight (invalidated)`);
    return true;
  }

  if (command === "block") {
    const id = rest[0] ?? "";
    const symptom = flag(rest, "symptom");
    const unblocks = flag(rest, "unblocks");
    const probe = flag(rest, "probe");
    const tested = flag(rest, "tested");
    const result = flag(rest, "result");
    if (!id || !symptom || !unblocks) {
      throw new LedgerError(
        "block: need --symptom and --unblocks plus --probe or --tested/--result",
      );
    }
    if (!probe && !(tested && result)) {
      throw new LedgerError("block: need --probe or --tested + --result");
    }
    let probeResult = result ?? "";
    if (probe) {
      const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim();
      const proc = Bun.spawn(["bash", "-lc", probe], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const out =
        (await new Response(proc.stdout).text()) +
        (await new Response(proc.stderr).text());
      const exit = await proc.exited;
      probeResult = `exit=${exit} ${out.slice(0, 200).replace(/\n/g, " ")}`;
    }
    let ev =
      `# block-evidence symptom=${symptom} unblocks=${unblocks}` +
      (probe ? ` probe=${probe}` : "") +
      (tested ? ` tested=${tested}` : "") +
      ` result=${probeResult}`;
    await mutate(matrixPath, (current) => {
      let next = setField(current, findRow(locateRows(current), id), "status", "blocked");
      return appendNote(next, findRow(locateRows(next), id), ev);
    });
    console.log(`${id} → blocked`);
    return true;
  }

  if (command === "remedy") {
    const id = rest[0] ?? "";
    const lines = await readLines(matrixPath);
    const block = findRow(locateRows(lines), id);
    const notes = blockNotes(lines, block);
    const req = parseRequires(notes);
    console.log(
      teachRemedy(
        id,
        "ready",
        missingSlugs(
          req.ready,
          parseChecks(notes),
          parseReceipts(notes),
          parseReviews(notes),
        ),
      ),
    );
    console.log(
      teachRemedy(
        id,
        "verified",
        missingSlugs(
          req.verified,
          parseChecks(notes),
          parseReceipts(notes),
          parseReviews(notes),
        ),
        [
          block.row.hostProof ? "" : "host_proof empty",
          block.row.targetProof ? "" : "target_proof empty",
        ].filter(Boolean),
      ),
    );
    return true;
  }

  return false;
}

/** Extra fail-closed gates for set/validate. */
export function assertStatusMandates(
  id: string,
  status: string,
  notes: readonly string[],
  hostProof: string,
  targetProof: string,
): void {
  if (status === "blocked" && parseBlockEvidence(notes) === null) {
    throw new LedgerError(
      `${id} cannot become "blocked" without block-evidence (use block command)`,
    );
  }
  if (status !== "ready" && status !== "verified") return;
  if (status === "ready" && hostProof.trim() === "") {
    throw new LedgerError(`${id} cannot become ready: host_proof empty`);
  }
  if (status === "verified" && targetProof.trim() === "") {
    throw new LedgerError(`${id} cannot become verified: target_proof empty`);
  }
  const req = parseRequires(notes);
  const want =
    status === "ready" ? req.ready : [...new Set([...req.ready, ...req.verified])];
  const miss = missingSlugs(
    want,
    parseChecks(notes),
    parseReceipts(notes),
    parseReviews(notes),
  );
  if (miss.length > 0) {
    throw new LedgerError(teachRemedy(id, status as "ready" | "verified", miss));
  }
}

export function validateRowMandates(
  id: string,
  status: string,
  notes: readonly string[],
): void {
  if (status === "blocked" && parseBlockEvidence(notes) === null) {
    throw new LedgerError(`${id} claims blocked without block-evidence`);
  }
  if (status !== "ready" && status !== "verified") return;
  const req = parseRequires(notes);
  const want =
    status === "ready" ? req.ready : [...new Set([...req.ready, ...req.verified])];
  const miss = missingSlugs(
    want,
    parseChecks(notes),
    parseReceipts(notes),
    parseReviews(notes),
  );
  if (miss.length > 0) {
    throw new LedgerError(
      `${id} claims ${status} but mandates unsatisfied: ${miss.map((m) => m.slug).join(", ")}`,
    );
  }
}

export { blockNotes, MAX_REVIEWS_PER_TARGET };
