/**
 * LEDGER CORE — parsing, locking, and line-surgical writes.
 *
 * This is a Bun/TypeScript port of the DOCTRINE behind torad-fleet's dev/campaigns/manifest.py
 * (7,530 lines), not of its code. The fleet CLI grew a large fleet-specific surface — seats,
 * dispatch, journals, cost, signatures — that this repository has no use for yet. What was ported is
 * the part that is load-bearing everywhere (concepts #945, #948, #957):
 *
 *   1. THE LEDGER IS THE MEMORY. Contexts die, sessions compact, agents get killed. An item must
 *      be resumable from the ledger alone, so decisions and resume pointers live in the item text
 *      and in dated `#` notes beside it.
 *
 *   2. WRITES ARE LINE-SURGICAL, NEVER A SERIALIZER ROUND-TRIP. Parse-then-restringify is the
 *      obvious implementation and it is catastrophic here: every TOML serializer discards
 *      comments, and the comments ARE the memory. So the parser is used to FIND things and to
 *      VALIDATE the result; the file is edited as lines.
 *
 *   3. EVERY WRITE RE-PARSES AND ROLLS BACK ON FAILURE. Ledger integrity is structural, not a
 *      matter of being careful.
 *
 *   4. WRITES TAKE AN EXCLUSIVE LOCK. Concurrent seats otherwise collide constantly on
 *      "file modified since read"; atomicity kills the entire class.
 *
 *   5. `get` COSTS ~15 LINES, NOT A WHOLE-FILE READ. Token cost is the orchestrator's scarcest
 *      resource, and keyed retrieval is why the ledger can grow without becoming unaffordable.
 */

import { openSync, closeSync, unlinkSync, statSync, renameSync } from "node:fs";

export type ItemStatus = "todo" | "in_flight" | "blocked" | "done" | "verified";

export const ITEM_STATUSES: readonly ItemStatus[] = [
  "todo",
  "in_flight",
  "blocked",
  "done",
  "verified",
];

export function isItemStatus(candidate: string): candidate is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(candidate);
}

export type Item = {
  readonly id: string;
  readonly phase: string;
  readonly title: string;
  readonly files: readonly string[];
  readonly status: ItemStatus;
  readonly verify: string;
  readonly claimedBy?: string;
  readonly claimedAt?: string;
};

/** A located item: the parsed values plus the exact line span it occupies in the file. */
export type ItemBlock = {
  readonly item: Item;
  /** Index of the `[[items]]` line. */
  readonly start: number;
  /** Index one past the block's last line. */
  readonly end: number;
};

export class LedgerError extends Error {}

// ── locking ───────────────────────────────────────────────────────────────────────────────────

/**
 * O_EXCL lockfile. `openSync(path, "wx")` fails if the path exists, and that check-and-create is
 * atomic on every local filesystem — which is the whole requirement. A lock older than
 * STALE_LOCK_MS is assumed to belong to a killed process and is broken; agents die mid-write
 * often enough that a lock with no expiry would eventually wedge the ledger permanently.
 */
const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;

async function acquireLock(ledgerPath: string): Promise<string> {
  const lockPath = `${ledgerPath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  for (;;) {
    try {
      const handle = openSync(lockPath, "wx");
      closeSync(handle);
      await Bun.write(lockPath, `${process.pid}\n${new Date().toISOString()}\n`);
      return lockPath;
    } catch {
      const age = Date.now() - (statSync(lockPath, { throwIfNoEntry: false })?.mtimeMs ?? 0);
      if (age > STALE_LOCK_MS) {
        try {
          unlinkSync(lockPath);
        } catch {
          // Another process broke the same stale lock first; retry the acquire.
        }
        continue;
      }
      if (Date.now() > deadline) {
        throw new LedgerError(
          `could not lock ${ledgerPath} after ${LOCK_TIMEOUT_MS}ms — another seat is writing`,
        );
      }
      await Bun.sleep(LOCK_RETRY_MS);
    }
  }
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // Already gone (stale-broken by a peer). Nothing to release.
  }
}

// ── reading ───────────────────────────────────────────────────────────────────────────────────

export async function readLines(ledgerPath: string): Promise<string[]> {
  const text = await Bun.file(ledgerPath).text();
  return text.split("\n");
}

/** Validate by parsing. Throws LedgerError with the parser's complaint if the file is malformed. */
export function parseOrThrow(text: string, ledgerPath: string): unknown {
  try {
    return Bun.TOML.parse(text);
  } catch (error) {
    throw new LedgerError(
      `${ledgerPath} is not valid TOML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const ITEM_HEADER = /^\[\[items\]\]\s*$/;
const TABLE_HEADER = /^\s*\[/;

function scalar(line: string, key: string): string | null {
  const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*$`));
  return match?.[1] === undefined ? null : match[1].replace(/\\"/g, '"');
}

function stringArray(line: string, key: string): readonly string[] | null {
  const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*\\[(.*)\\]\\s*$`));
  if (match?.[1] === undefined) return null;
  const inner = match[1].trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((piece) => piece.trim().replace(/^"|"$/g, ""))
    .filter((piece) => piece !== "");
}

/**
 * Locate every item block by scanning lines. Deliberately independent of the TOML parser: the
 * parser gives values but not line spans, and the line spans are what every write needs.
 */
export function locateItems(lines: readonly string[]): ItemBlock[] {
  const blocks: ItemBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!ITEM_HEADER.test(lines[index] ?? "")) continue;

    let end = index + 1;
    while (end < lines.length && !TABLE_HEADER.test(lines[end] ?? "")) end += 1;

    // Trailing blank lines belong between blocks, not inside one — notes must append directly
    // beneath the item's last real line or they drift away from what they describe.
    let lastContent = end;
    while (lastContent > index + 1 && (lines[lastContent - 1] ?? "").trim() === "") {
      lastContent -= 1;
    }

    const body = lines.slice(index, lastContent);
    const rawStatus = body.map((line) => scalar(line, "status")).find((value) => value !== null);
    const status = rawStatus !== null && rawStatus !== undefined && isItemStatus(rawStatus)
      ? rawStatus
      : "todo";

    const claimedBy = body.map((line) => scalar(line, "claimed_by")).find((v) => v !== null);
    const claimedAt = body.map((line) => scalar(line, "claimed_at")).find((v) => v !== null);

    blocks.push({
      start: index,
      end: lastContent,
      item: {
        id: body.map((line) => scalar(line, "id")).find((v) => v !== null) ?? "",
        phase: body.map((line) => scalar(line, "phase")).find((v) => v !== null) ?? "",
        title: body.map((line) => scalar(line, "title")).find((v) => v !== null) ?? "",
        files: body.map((line) => stringArray(line, "files")).find((v) => v !== null) ?? [],
        status,
        verify: body.map((line) => scalar(line, "verify")).find((v) => v !== null) ?? "",
        ...(claimedBy != null ? { claimedBy } : {}),
        ...(claimedAt != null ? { claimedAt } : {}),
      },
    });

    index = end - 1;
  }

  return blocks;
}

export function findBlock(blocks: readonly ItemBlock[], id: string): ItemBlock {
  const found = blocks.find((block) => block.item.id === id);
  if (found === undefined) throw new LedgerError(`no item with id "${id}"`);
  return found;
}

/** The `#` comment lines inside an item block — its construction diary. */
export function notesOf(lines: readonly string[], block: ItemBlock): string[] {
  return lines
    .slice(block.start, block.end)
    .filter((line) => line.trimStart().startsWith("#"))
    .map((line) => line.trim());
}

/** The header comment block above the first table — where the laws live. */
export function headerLines(lines: readonly string[]): string[] {
  const header: string[] = [];
  for (const line of lines) {
    if (TABLE_HEADER.test(line)) break;
    header.push(line);
  }
  return header;
}

// ── writing ───────────────────────────────────────────────────────────────────────────────────

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The only write path. Takes the lock, applies a pure line transform, validates the result by
 * re-parsing, and writes only if it parses — otherwise the original file is left untouched and
 * the caller gets the parser's complaint.
 *
 * The transform is pure and line-based on purpose. A callback that could reach for a TOML
 * serializer would strip every comment in the file, and the comments are the memory.
 */
export async function mutate(
  ledgerPath: string,
  transform: (lines: readonly string[]) => readonly string[],
): Promise<void> {
  const lockPath = await acquireLock(ledgerPath);
  try {
    const original = await Bun.file(ledgerPath).text();
    const next = transform(original.split("\n")).join("\n");

    // Validate BEFORE writing: rollback is then simply "never wrote it".
    parseOrThrow(next, ledgerPath);

    /**
     * TEMP FILE + ATOMIC RENAME, not a direct write.
     *
     * `Bun.write` to the live path truncates first and then streams. A kill between those two —
     * a rate-limit death, an interrupt, an OOM — leaves a TRUNCATED ledger. And truncation here is
     * uniquely nasty: the regex scanner reads a half-file perfectly happily, reporting fewer items
     * rather than an error, so the campaign silently forgets work instead of failing loudly.
     * `validate` cross-checks the scanner against the TOML parser, but a clean cut at a block
     * boundary can satisfy both.
     *
     * `rename(2)` within a filesystem is atomic: a concurrent reader sees either the whole old file
     * or the whole new one, never a partial. The temp file sits in the same directory precisely so
     * the rename cannot cross a filesystem boundary and silently degrade to copy-then-delete.
     */
    const tempPath = `${ledgerPath}.${process.pid}.tmp`;
    try {
      await Bun.write(tempPath, next);
      renameSync(tempPath, ledgerPath);
    } catch (error) {
      // A failed rename must not leave debris that a later glob mistakes for a ledger.
      try {
        unlinkSync(tempPath);
      } catch {
        // Never existed, or already gone. Either way there is nothing to clean up.
      }
      throw error;
    }
  } finally {
    releaseLock(lockPath);
  }
}

/** Escape a value for a TOML basic string. */
export function toml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
