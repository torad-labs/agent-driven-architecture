#!/usr/bin/env bun
/**
 * THE LEDGER CLI — the only channel to campaign state.
 *
 *   bun dev/campaigns/ledger.ts <ledger.toml> <command> [args]
 *
 * Raw edits to the ledger are blocked by .claude/hooks/modules/02-ledger-channel.ts, because a
 * raw edit skips the lock, skips the validate-and-rollback, and risks stripping the `#` comments
 * that carry every decision and resume pointer.
 *
 * The ledger path is the first argument, matching the fleet CLI's shape, so one binary serves any
 * number of campaigns.
 */

import { liveGrant } from "../../.claude/hooks/grant-store.ts";
import {
  findBlock,
  headerLines,
  isItemStatus,
  ITEM_STATUSES,
  LedgerError,
  locateItems,
  mutate,
  notesOf,
  parseOrThrow,
  readLines,
  toml,
  today,
  type ItemBlock,
  type ItemStatus,
} from "./ledger-core.ts";
import {
  assertItemMandates,
  handleLedgerEarn,
} from "./ledger-earn.ts";
import {
  parseDepends,
  parseRequires,
  parseReviews,
} from "./earn-core.ts";

const USAGE = `usage: bun dev/campaigns/ledger.ts <ledger.toml> <command> [args]

read
  list [--status S] [--phase P]     compact table of items
  get <ID>                          one item with its notes (~15 lines, not the whole file)
  next                              the next actionable item
  laws                              the law sheet from the ledger header
  packet <ID>                       a self-contained dispatch brief with computed fences

write
  add --id I --phase P --title T [--files a,b] [--verify V] [--status S]
  set-status <ID> <status>          ${ITEM_STATUSES.join(" | ")}
  note <ID> "text"                  append a dated note (never rewrites history)
  depends <ID> <dep[,…]>
  require <ID> <done|verified> <slug[,…]>
  remedy <ID>
  (hydrate closed items: bun dev/campaigns/hydrate.ts <ledger> <ID>)
  claim <ID> <seat>                 record ownership with a liveness stamp
  release-stale [--minutes N]       release claims older than N minutes (default 60)
  add-law "text"                    append a law to the header
  amend-header <old> <new>          replace a line in the header
  amend <ID> [--title T] [--verify V] [--files a,b]
                                    rewrite dispatch fields (grant-gated; old values auto-noted)

check
  validate                          parse the ledger and report item counts
  selftest                          exercise the CLI against a temporary ledger`;

// ── argument helpers ──────────────────────────────────────────────────────────────────────────

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function required(argv: readonly string[], name: string): string {
  const value = flag(argv, name);
  if (value === null) throw new LedgerError(`--${name} is required`);
  return value;
}

function positional(argv: readonly string[], index: number, what: string): string {
  const value = argv[index];
  if (value === undefined) throw new LedgerError(`expected ${what}`);
  return value;
}

// ── read commands ─────────────────────────────────────────────────────────────────────────────

const STATUS_MARK: Record<ItemStatus, string> = {
  todo: "·",
  in_flight: "▸",
  blocked: "■",
  done: "○",
  verified: "●",
};

function renderList(blocks: readonly ItemBlock[], status: string | null, phase: string | null): string {
  const rows = blocks
    .map((block) => block.item)
    .filter((item) => (status === null || item.status === status))
    .filter((item) => (phase === null || item.phase === phase));

  if (rows.length === 0) return "no matching items";

  const widest = Math.max(...rows.map((item) => item.id.length));
  const lines = rows.map((item) => {
    const claim = item.claimedBy === undefined ? "" : `  @${item.claimedBy}`;
    return `${STATUS_MARK[item.status]} ${item.id.padEnd(widest)}  ${item.status.padEnd(9)}  ${item.phase.padEnd(10)}  ${item.title}${claim}`;
  });

  const tally = ITEM_STATUSES.map((candidate) => {
    const count = blocks.filter((block) => block.item.status === candidate).length;
    return count === 0 ? null : `${candidate} ${count}`;
  }).filter((entry) => entry !== null);

  return `${lines.join("\n")}\n\n${rows.length} shown · ${tally.join(" · ")}`;
}

function renderItem(lines: readonly string[], block: ItemBlock): string {
  const { item } = block;
  const notes = notesOf(lines, block);
  const body = [
    `${STATUS_MARK[item.status]} ${item.id}  [${item.status}]  phase=${item.phase}`,
    ``,
    `  ${item.title}`,
    ``,
    `  files  : ${item.files.length === 0 ? "(none declared)" : item.files.join(", ")}`,
    `  verify : ${item.verify === "" ? "(none declared)" : item.verify}`,
  ];
  if (item.claimedBy !== undefined) {
    body.push(`  claim  : ${item.claimedBy} since ${item.claimedAt ?? "unknown"}`);
  }
  const depends = parseDepends(notes);
  const req = parseRequires(notes);
  const reviews = parseReviews(notes);
  if (depends.length > 0) body.push(``, `  depends: ${depends.join(", ")}`);
  if (req.ready.length || req.verified.length) {
    body.push(``, `  mandates:`);
    if (req.ready.length) body.push(`    done/ready : ${req.ready.join(", ")}`);
    if (req.verified.length) body.push(`    verified   : ${req.verified.join(", ")}`);
  }
  if (reviews.length > 0) {
    body.push(``, `  reviews: ${reviews.length}/3`);
    for (const r of reviews) body.push(`    · #${r.n} ${r.verdict} ${r.artifact}`);
  }
  if (notes.length > 0) {
    body.push(``, `  notes (append-only — the construction diary):`);
    for (const note of notes) body.push(`    ${note}`);
  }
  return body.join("\n");
}

/**
 * The next actionable item: an in-flight one if any is open (finish before starting), otherwise
 * the first todo. Blocked items are never "next" — a blocked item needs a ruling, not a builder.
 */
function pickNext(blocks: readonly ItemBlock[]): ItemBlock | null {
  return (
    blocks.find((block) => block.item.status === "in_flight") ??
    blocks.find((block) => block.item.status === "todo") ??
    null
  );
}

/**
 * A dispatch packet. Self-contained by construction (concept #945 §5): laws, the item text, the
 * writable fence, the verify gate, and the reply contract. A packet that makes the reader open
 * the ledger to understand it has already failed — the point is that a fresh context can act.
 */
function renderPacket(lines: readonly string[], block: ItemBlock): string {
  const { item } = block;
  const laws = headerLines(lines)
    .filter((line) => line.trimStart().startsWith("# LAW:"))
    .map((line) => `  ${line.replace(/^\s*#\s*/, "")}`);

  return [
    `ITEM ${item.id} — ${item.phase}`,
    ``,
    item.title,
    ``,
    `WRITABLE FENCE (do not write outside this list):`,
    item.files.length === 0
      ? `  (none declared — declare files before dispatching, or the fence is meaningless)`
      : item.files.map((file) => `  ${file}`).join("\n"),
    ``,
    `VERIFY GATE (this is the definition of done for this item):`,
    `  ${item.verify === "" ? "(none declared — do not dispatch without one)" : item.verify}`,
    ``,
    ...(() => {
      const notes = notesOf(lines, block);
      const depends = parseDepends(notes);
      const req = parseRequires(notes);
      const parts: string[] = [];
      if (depends.length) {
        parts.push(`DEPENDS (finish these first):`, ...depends.map((d) => `  ${d}`), ``);
      }
      if (req.ready.length || req.verified.length) {
        parts.push(`MANDATES (earned-row; status refused without receipts):`);
        if (req.ready.length) parts.push(`  done     : ${req.ready.join(", ")}`);
        if (req.verified.length) parts.push(`  verified : ${req.verified.join(", ")}`);
        parts.push(
          `  review-clean → subagents: bun dev/campaigns/review.ts prepare ${item.id} --diff <range>`,
          ``,
        );
      }
      return parts;
    })(),
    `LAWS IN FORCE:`,
    laws.length === 0 ? `  (none in header)` : laws.join("\n"),
    ``,
    `REPORTING:`,
    `  Write landing details as ledger notes:`,
    `    bun dev/campaigns/ledger.ts <ledger> note ${item.id} "..."`,
    `  Then send exactly one line: "${item.id} done — see ledger".`,
    `  Long prose over the channel is the anti-pattern; the note IS the report.`,
    ``,
    `PREMISE CHECK:`,
    `  If anything in this packet contradicts the repo, REPORT it — do not obey it. A wrong`,
    `  premise from the orchestrator is still a wrong premise.`,
    ``,
    `DO NOT COMMIT. The orchestrator holds the single gated commit point.`,
  ].join("\n");
}

// ── write commands ────────────────────────────────────────────────────────────────────────────

function withStatus(lines: readonly string[], block: ItemBlock, status: ItemStatus): string[] {
  const next = [...lines];
  for (let index = block.start; index < block.end; index += 1) {
    if (/^\s*status\s*=/.test(next[index] ?? "")) {
      next[index] = `status = ${toml(status)}`;
      return next;
    }
  }
  next.splice(block.end, 0, `status = ${toml(status)}`);
  return next;
}

function withNote(lines: readonly string[], block: ItemBlock, text: string): string[] {
  const next = [...lines];
  next.splice(block.end, 0, `# ${today()} ${text}`);
  return next;
}

function withField(lines: readonly string[], block: ItemBlock, key: string, value: string | null): string[] {
  const next = [...lines];
  for (let index = block.start; index < block.end; index += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(next[index] ?? "")) {
      if (value === null) {
        next.splice(index, 1);
        return next;
      }
      next[index] = `${key} = ${toml(value)}`;
      return next;
    }
  }
  if (value !== null) next.splice(block.end, 0, `${key} = ${toml(value)}`);
  return next;
}

// ── dispatch ──────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const argv = Bun.argv.slice(2);
  const ledgerPath = argv[0];
  const command = argv[1];

  if (ledgerPath === undefined || command === undefined || command === "help") {
    console.log(USAGE);
    return ledgerPath === undefined ? 1 : 0;
  }

  if (command === "selftest") return await selftest();

  const rest = argv.slice(2);

  /**
   * `verified` IS THE ORCHESTRATOR'S WORD ON THIS PLANE TOO.
   *
   * The matrix got this control in round 3 and the ledger did not, which was backwards: "only the
   * orchestrator sets verified" is the CAMPAIGN law, so the ledger is the plane where it matters
   * most and it was the plane without the gate. Any seat could close its own item as verified.
   *
   *   done      a builder claims it landed
   *   verified  the orchestrator independently re-ran the gates, read the diff, and confirmed
   *             against the packet
   *
   * Same honest limit as everywhere else: on a NOPASSWD host a builder that wants to set this can.
   * What the check buys is that doing so becomes deliberate and self-incriminating rather than the
   * default path.
   */
  const ORCHESTRATOR_ENV = "LEDGER_ORCHESTRATOR";
  const claimsVerified =
    (command === "set-status" && rest[1] === "verified") ||
    (command === "add" && flag(rest, "status") === "verified");

  if (claimsVerified && (process.env[ORCHESTRATOR_ENV] ?? "") !== "1") {
    throw new LedgerError(
      `"verified" is the orchestrator's word, not a builder's.\n\n` +
        `  done      a builder claims it landed\n` +
        `  verified  the orchestrator independently re-ran the gates, read the diff, and\n` +
        `            confirmed against the packet\n\n` +
        `Set it to "done" and report; the orchestrator verifies. If you ARE the orchestrator,\n` +
        `re-run with ${ORCHESTRATOR_ENV}=1 set inline.\n\n` +
        `Stated plainly: on a NOPASSWD host a builder that wants to set this can. What the check\n` +
        `buys is that doing so is deliberate rather than the default path.`,
    );
  }

  /**
   * THE LAW CHANNEL IS GRANT-GATED.
   *
   * `10-law-injection` splices every `# LAW:` line from the header into every future session,
   * introduced there as "not advice". Left open, `add-law` is an unauthenticated cross-session
   * prompt-injection channel: any seat appends a line, and every later session — the
   * orchestrator's included — ingests it as binding law. `book-laws` only checks name parity, and
   * only when someone runs it.
   *
   * The file wall cannot cover this, because the CLI is the SANCTIONED writer. So the check lives
   * at the one door that is allowed through.
   *
   * What it buys, precisely: on a NOPASSWD host the header stays writable by other means. This
   * stops the law channel from being the CONVENIENT path, and makes a law change something the
   * operator authorised rather than something that simply appeared.
   */
  if (command === "add-law" || command === "amend-header" || command === "amend") {
    const repoRoot = (await Bun.$`git rev-parse --show-toplevel`.quiet().nothrow().text()).trim();
    const grant = await liveGrant(repoRoot === "" ? "." : repoRoot);
    if (grant === null) {
      // `amend` sits behind the same gate for the same reason in a different plane: the packet
      // renders title/verify/files verbatim as the brief and the definition of done, so an open
      // amend lets a seat weaken its own done-bar — the self-grant shape with a field for a wall.
      const what =
        command === "amend"
          ? `rewrites dispatch fields the packet renders verbatim — the writable fence and the ` +
            `definition of done`
          : `writes the law header, which is injected into every future session as binding law`;
      throw new LedgerError(
        `"${command}" ${what}. That needs a grant.\n\n` +
          `Ask the operator to type:  /grant <why this is changing>`,
      );
    }
    /**
     * THIS CHECK IS NOT SESSION-BOUND, AND CANNOT BE.
     *
     * The PreToolUse grant gate compares `payload.session_id`, so a grant issued to one seat does
     * not open another. This door has no equivalent: the CLI runs under Bash, and a Bash process
     * carries no session identity for the check to compare against. So while a grant is open, ANY
     * seat's `add-law` is authorised by it — including a concurrent builder the operator was not
     * thinking about when they typed it.
     *
     * That is a real weakening of the session-binding property, and it is announced on every use
     * rather than left for someone to discover in the source. Keep law-changing windows short.
     */
    console.error(
      `note: this grant is NOT session-bound. The CLI runs under Bash, which carries no session\n` +
        `      id, so while the grant is open any concurrent seat's add-law/amend-header is also\n` +
        `      authorised by it. Grant expires ${grant.expiresAt}. Keep the window short.`,
    );
  }

  const lines = await readLines(ledgerPath);
  const blocks = locateItems(lines);

  switch (command) {
    case "list":
      console.log(renderList(blocks, flag(rest, "status"), flag(rest, "phase")));
      return 0;

    case "get":
      console.log(renderItem(lines, findBlock(blocks, positional(rest, 0, "an item id"))));
      return 0;

    case "next": {
      const chosen = pickNext(blocks);
      console.log(chosen === null ? "queue empty" : renderItem(lines, chosen));
      return 0;
    }

    case "laws": {
      const laws = headerLines(lines).filter((line) => line.trimStart().startsWith("# LAW:"));
      console.log(laws.length === 0 ? "no laws in header" : laws.join("\n"));
      return 0;
    }

    case "packet":
      console.log(renderPacket(lines, findBlock(blocks, positional(rest, 0, "an item id"))));
      return 0;

    case "validate": {
      const parsed = parseOrThrow(lines.join("\n"), ledgerPath) as { items?: unknown[] };
      const parsedCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
      if (parsedCount !== blocks.length) {
        throw new LedgerError(
          `line scan found ${blocks.length} items but the parser found ${parsedCount} — ` +
            `the scanner and the parser disagree, which means one of them is wrong about this file`,
        );
      }
      console.log(`${ledgerPath}: valid · ${blocks.length} items`);
      return 0;
    }

    case "set-status": {
      const id = positional(rest, 0, "an item id");
      const status = positional(rest, 1, `a status (${ITEM_STATUSES.join("|")})`);
      if (!isItemStatus(status)) throw new LedgerError(`"${status}" is not a status`);
      await mutate(ledgerPath, (current) => {
        const block = findBlock(locateItems(current), id);
        assertItemMandates(id, status, notesOf(current, block));
        return withStatus(current, block, status);
      });
      console.log(`${id} → ${status}`);
      return 0;
    }

    case "note": {
      const id = positional(rest, 0, "an item id");
      const text = positional(rest, 1, "note text");
      await mutate(ledgerPath, (current) =>
        withNote(current, findBlock(locateItems(current), id), text),
      );
      console.log(`${id}: note appended`);
      return 0;
    }

    case "claim": {
      const id = positional(rest, 0, "an item id");
      const seat = positional(rest, 1, "a seat name");
      await mutate(ledgerPath, (current) => {
        const block = findBlock(locateItems(current), id);
        if (block.item.claimedBy !== undefined && block.item.claimedBy !== seat) {
          throw new LedgerError(
            `${id} is already claimed by ${block.item.claimedBy} since ${block.item.claimedAt} — ` +
              `use release-stale if that seat is dead`,
          );
        }
        const withSeat = withField(current, block, "claimed_by", seat);
        const relocated = findBlock(locateItems(withSeat), id);
        return withField(withSeat, relocated, "claimed_at", new Date().toISOString());
      });
      console.log(`${id} claimed by ${seat}`);
      return 0;
    }

    case "release-stale": {
      const minutes = Number.parseInt(flag(rest, "minutes") ?? "60", 10);
      const cutoff = Date.now() - minutes * 60_000;
      const stale = blocks.filter((block) => {
        if (block.item.claimedAt === undefined) return false;
        return Date.parse(block.item.claimedAt) < cutoff;
      });

      for (const block of stale) {
        await mutate(ledgerPath, (current) => {
          const located = findBlock(locateItems(current), block.item.id);
          const cleared = withField(current, located, "claimed_by", null);
          const relocated = findBlock(locateItems(cleared), block.item.id);
          return withField(cleared, relocated, "claimed_at", null);
        });
      }
      console.log(
        stale.length === 0
          ? `no claims older than ${minutes}m`
          : `released ${stale.map((block) => block.item.id).join(", ")}`,
      );
      return 0;
    }

    case "add": {
      const id = required(rest, "id");
      if (blocks.some((block) => block.item.id === id)) {
        throw new LedgerError(`item "${id}" already exists`);
      }
      const files = (flag(rest, "files") ?? "")
        .split(",")
        .map((piece) => piece.trim())
        .filter((piece) => piece !== "");
      const status = flag(rest, "status") ?? "todo";
      if (!isItemStatus(status)) throw new LedgerError(`"${status}" is not a status`);

      await mutate(ledgerPath, (current) => {
        const trimmed = [...current];
        while (trimmed.length > 0 && (trimmed.at(-1) ?? "").trim() === "") trimmed.pop();
        return [
          ...trimmed,
          ``,
          `[[items]]`,
          `id = ${toml(id)}`,
          `phase = ${toml(required(rest, "phase"))}`,
          `title = ${toml(required(rest, "title"))}`,
          `files = [${files.map((file) => toml(file)).join(", ")}]`,
          `status = ${toml(status)}`,
          `verify = ${toml(flag(rest, "verify") ?? "")}`,
          ``,
        ];
      });
      console.log(`added ${id}`);
      return 0;
    }

    case "amend": {
      const id = positional(rest, 0, "an item id");
      const title = flag(rest, "title");
      const verify = flag(rest, "verify");
      const filesCsv = flag(rest, "files");
      if (title === null && verify === null && filesCsv === null) {
        throw new LedgerError("amend: provide at least one of --title, --verify, --files");
      }
      await mutate(ledgerPath, (current) => {
        let next = [...current];
        let block = findBlock(locateItems(next), id);
        const audit: string[] = [];
        if (title !== null) {
          audit.push(`title was ${toml(block.item.title)}`);
          next = withField(next, block, "title", title);
          block = findBlock(locateItems(next), id);
        }
        if (verify !== null) {
          audit.push(`verify was ${toml(block.item.verify)}`);
          next = withField(next, block, "verify", verify);
          block = findBlock(locateItems(next), id);
        }
        if (filesCsv !== null) {
          const files = filesCsv
            .split(",")
            .map((piece) => piece.trim())
            .filter((piece) => piece !== "");
          audit.push(`files were [${block.item.files.map((file) => toml(file)).join(", ")}]`);
          let replaced = false;
          for (let index = block.start; index < block.end; index += 1) {
            if (/^\s*files\s*=/.test(next[index] ?? "")) {
              next[index] = `files = [${files.map((file) => toml(file)).join(", ")}]`;
              replaced = true;
              break;
            }
          }
          if (!replaced) throw new LedgerError(`item "${id}" has no files line`);
          block = findBlock(locateItems(next), id);
        }
        // The old values are the audit trail: an amend that leaves no trace of what it replaced
        // is a rewrite of history, which is exactly what this CLI exists to prevent.
        return withNote(next, block, `amend (grant window): ${audit.join("; ")}`);
      });
      console.log(`${id}: amended — old values preserved as a dated note`);
      return 0;
    }

    case "add-law": {
      const text = positional(rest, 0, "law text");
      await mutate(ledgerPath, (current) => {
        const header = headerLines(current);
        let insertAt = header.length;
        while (insertAt > 0 && (current[insertAt - 1] ?? "").trim() === "") insertAt -= 1;
        const next = [...current];
        next.splice(insertAt, 0, `# LAW: ${text}`);
        return next;
      });
      console.log("law appended");
      return 0;
    }

    case "amend-header": {
      const old = positional(rest, 0, "the existing header text");
      const replacement = positional(rest, 1, "the replacement text");
      await mutate(ledgerPath, (current) => {
        const headerLength = headerLines(current).length;
        const index = current.findIndex((line, at) => at < headerLength && line.includes(old));
        if (index === -1) throw new LedgerError(`no header line contains "${old}"`);
        const next = [...current];
        next[index] = (next[index] ?? "").replace(old, replacement);
        return next;
      });
      console.log("header amended");
      return 0;
    }

    default: {
      const handled = await handleLedgerEarn(ledgerPath, command, rest, {
        locateItems,
        findBlock,
        flag,
      });
      if (handled) return 0;
      console.error(`unknown command "${command}"\n\n${USAGE}`);
      return 1;
    }
  }
}

// ── selftest ──────────────────────────────────────────────────────────────────────────────────

/**
 * Runs the CLI against a throwaway ledger. Required at every vendoring: a ledger CLI that has
 * never been watched preserve a comment is a ledger CLI that will one day eat the memory.
 */
async function selftest(): Promise<number> {
  const path = `${process.env["TMPDIR"] ?? "/tmp"}/eli-ledger-selftest-${process.pid}.toml`;
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
      `# selftest ledger`,
      `# LAW: manifest-is-memory — an item must be resumable from the ledger alone`,
      `# LAW: verified-commits-immediately`,
      ``,
      `[[items]]`,
      `id = "H1"`,
      `phase = "harness"`,
      `title = "first item"`,
      `files = ["dev/a.ts"]`,
      `status = "todo"`,
      `verify = "bun run gate"`,
      `# 2026-07-26 a pre-existing note that must survive every write`,
      ``,
      `[[items]]`,
      `id = "H2"`,
      `phase = "harness"`,
      `title = "second item"`,
      `files = []`,
      `status = "verified"`,
      `verify = ""`,
      ``,
    ].join("\n"),
  );

  const run = async (...args: string[]): Promise<string> => {
    const proc = Bun.spawn(["bun", import.meta.path, path, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    await proc.exited;
    return out + err;
  };

  console.log("ledger selftest");

  check("list shows both items", (await run("list")).includes("H1") && (await run("list")).includes("H2"));
  check("list --status filters", !(await run("list", "--status", "todo")).includes("H2"));
  check("get returns the item", (await run("get", "H1")).includes("first item"));
  check("get surfaces existing notes", (await run("get", "H1")).includes("must survive"));
  check("next prefers an open item", (await run("next")).includes("H1"));
  check("laws reads the header", (await run("laws")).includes("manifest-is-memory"));
  check("packet is self-contained", (await run("packet", "H1")).includes("WRITABLE FENCE"));
  check("packet carries the laws", (await run("packet", "H1")).includes("manifest-is-memory"));

  await run("set-status", "H1", "in_flight");
  await run("note", "H1", "a note added by the selftest");
  await run("claim", "H1", "builder-1");

  const afterWrites = await Bun.file(path).text();

  // THE LOAD-BEARING ASSERTION. A serializer round-trip would have silently eaten both of these,
  // the file would still parse, every other check here would still pass, and the campaign's
  // memory would be gone. This is the check the whole line-surgical design exists to satisfy.
  check("header comments survive writes", afterWrites.includes("# LAW: manifest-is-memory"));
  check("pre-existing item notes survive writes", afterWrites.includes("must survive every write"));
  check("the new note landed", afterWrites.includes("a note added by the selftest"));
  check("the note is dated", new RegExp(`# ${today()} a note added`).test(afterWrites));

  check("set-status took effect", (await run("get", "H1")).includes("[in_flight]"));
  check("claim recorded the seat", (await run("get", "H1")).includes("builder-1"));
  check("a second claim by another seat is refused", (await run("claim", "H1", "builder-2")).includes("already claimed"));
  check("release-stale spares a fresh claim", (await run("release-stale", "--minutes", "60")).includes("no claims older"));
  check("release-stale releases an old one", (await run("release-stale", "--minutes", "0")).includes("H1"));

  await run("add", "--id", "H3", "--phase", "harness", "--title", "third", "--verify", "bun run gate");
  check("add created the item", (await run("get", "H3")).includes("third"));
  check("duplicate ids are refused", (await run("add", "--id", "H3", "--phase", "p", "--title", "t")).includes("already exists"));

  // THE LAW CHANNEL. `10-law-injection` splices every `# LAW:` line into every future session as
  // binding law, so `add-law` is a cross-session injection channel and now requires a grant.
  //
  // The assertion is written against the ACTUAL grant state rather than assuming one. Hardcoding
  // "add-law is refused" would pass or fail depending on whether a grant happened to be open when
  // the suite ran — a test whose verdict depends on ambient state is not a test. Both branches
  // exercise the real code path; neither is a skip.
  const repoRoot = (await Bun.$`git rev-parse --show-toplevel`.quiet().nothrow().text()).trim();
  const grantOpen = (await liveGrant(repoRoot === "" ? "." : repoRoot)) !== null;
  const lawAttempt = await run("add-law", "silence-is-a-system-bug");

  if (grantOpen) {
    check("with a grant live, add-law appends to the header", (await run("laws")).includes("silence-is-a-system-bug"));
    check("add-law did not disturb existing laws", (await run("laws")).includes("verified-commits-immediately"));
  } else {
    check("without a grant, add-law is REFUSED", lawAttempt.includes("needs a grant"));
    check(
      "the refusal wrote nothing — fails closed, not half-applied",
      !(await run("laws")).includes("silence-is-a-system-bug"),
    );
    check(
      "amend-header is gated by the same rule",
      (await run("amend-header", "manifest-is-memory", "tampered")).includes("needs a grant"),
    );
    check("existing laws are untouched by a refused attempt", (await run("laws")).includes("verified-commits-immediately"));
  }

  // THE AMEND CHANNEL. `amend` rewrites what a packet renders verbatim — the fence and the
  // definition of done — so it sits behind the same grant as the law channel, and every use must
  // preserve the old value as a dated note. Same both-branches pattern as add-law above.
  const amendAttempt = await run("amend", "H1", "--verify", "a brand new verify gate");
  if (grantOpen) {
    check("with a grant live, amend replaces the verify field", (await run("get", "H1")).includes("a brand new verify gate"));
    check("amend preserved the old value as a dated note", (await run("get", "H1")).includes("verify was"));
    check("amend did not eat prior notes", (await run("get", "H1")).includes("must survive"));
    check("amend with no field flags is refused", (await run("amend", "H1")).includes("at least one of"));
  } else {
    check("without a grant, amend is REFUSED", amendAttempt.includes("needs a grant"));
    check("the refused amend wrote nothing", !(await run("get", "H1")).includes("a brand new verify gate"));
  }

  check("validate passes", (await run("validate")).includes("valid"));
  check("unknown ids are refused", (await run("get", "NOPE")).includes("no item with id"));
  check("invalid statuses are refused", (await run("set-status", "H1", "sideways")).includes("not a status"));

  await Bun.file(path).delete().catch(() => {});
  await Bun.file(`${path}.lock`).delete().catch(() => {});

  console.log(`${checks - failures}/${checks} checks passed`);
  return failures > 0 ? 1 : 0;
}

try {
  process.exit(await main());
} catch (error) {
  if (error instanceof LedgerError) {
    console.error(`ledger: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
