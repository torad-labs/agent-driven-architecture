/**
 * Campaign-ledger depends: a row names the rows it waits on.
 */
import { LedgerError, mutate } from "./ledger-core.ts";
import { formatDependsNote, parseDepends } from "./earn-core.ts";

function notes(lines: readonly string[], block: any): string[] {
  return lines
    .slice(block.start, block.end)
    .filter((l) => l.trimStart().startsWith("#"))
    .map((l) => l.trim());
}

function append(lines: readonly string[], block: any, note: string): string[] {
  const next = [...lines];
  next.splice(block.end, 0, note);
  return next;
}

export async function handleLedgerEarn(
  ledgerPath: string,
  command: string,
  rest: readonly string[],
  api: {
    locateItems: (lines: readonly string[]) => any[];
    findBlock: (blocks: readonly any[], id: string) => any;
    flag: (argv: readonly string[], name: string) => string | null;
  },
): Promise<boolean> {
  const { locateItems, findBlock } = api;

  if (command === "depends") {
    const id = rest[0] ?? "";
    const deps = (rest[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!id || deps.length === 0) {
      throw new LedgerError("depends: usage depends <ID> <depId[,depId…]>");
    }
    await mutate(ledgerPath, (current) => {
      const block = findBlock(locateItems(current), id);
      const existing = parseDepends(notes(current, block));
      const merged = [...new Set([...existing, ...deps])];
      const next = [...current];
      const re = /^#\s*depends:/;
      for (let i = block.start; i < block.end; i++) {
        if (re.test((next[i] ?? "").trim())) {
          next[i] = formatDependsNote(merged);
          return next;
        }
      }
      return append(next, block, formatDependsNote(merged));
    });
    console.log(`${id}: depends += ${deps.join(",")}`);
    return true;
  }

  return false;
}
