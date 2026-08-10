/**
 * DELTA DIGEST — zero bytes when nothing changed.
 *
 * Fires per prompt. Reports only what MOVED in the ledger and matrix since the last turn, so a
 * session running alongside other seats notices their landings without polling.
 *
 * THE ZERO-BYTES-IDLE RULE IS THE WHOLE DESIGN. A digest that says "no changes" every turn is an
 * always-on tax: it costs tokens on every future turn forever, it trains the reader to skip the
 * block, and by the time something real appears there the habit of ignoring it is established.
 * Silence when idle is what makes the output worth reading when it is not silent.
 *
 * Hard-capped for the same reason. A digest that can grow without bound will, on exactly the turn
 * when a lot changed — which is the turn the reader can least afford a wall of text.
 */

import { locateItems, readLines } from "../../../dev/campaigns/ledger-core.ts";
import { LEDGER, MATRIX } from "../repo.ts";
import type { HookModule, HookPayload, HookVerdict } from "../types.ts";

const MAX_LINES = 12;

/**
 * PER-SEAT STATE, not one file per repository.
 *
 * A single shared baseline means the first seat to prompt CONSUMES the delta: it sees the change,
 * writes the new baseline, and every other concurrent seat then compares against a state that
 * already includes the change it was never told about. The seat that most needed to know a wall
 * moved is exactly the one that silently misses it.
 *
 * Keyed by session, so each seat gets its own baseline and its own delta. Falls back to a shared
 * key when no session id is present, which is worse but is the single-seat case where it does not
 * matter.
 */
function statePath(root: string, sessionId: string | null | undefined): string {
  const key = (sessionId ?? "shared").replace(/[^A-Za-z0-9_-]/g, "");
  return `${root}/.claude/.digest-state-${key === "" ? "shared" : key}.json`;
}

/** Sessions end without warning, so stale baselines are pruned on the way past rather than tracked. */
const STATE_TTL_MS = 7 * 24 * 3_600_000;

async function pruneStaleState(root: string): Promise<void> {
  const dir = `${root}/.claude`;
  const names = await Array.fromAsync(
    new Bun.Glob(".digest-state-*.json").scan({ cwd: dir, dot: true }),
  ).catch(() => [] as string[]);

  const cutoff = Date.now() - STATE_TTL_MS;
  for (const name of names) {
    const stat = await Bun.file(`${dir}/${name}`).stat().catch(() => null);
    if (stat !== null && stat.mtimeMs < cutoff) {
      await Bun.file(`${dir}/${name}`).delete().catch(() => {});
    }
  }
}

type Snapshot = Record<string, string>;

/**
 * THE ENFORCEMENT PLANE IS WATCHED TOO.
 *
 * Until 2026-07-27 this digest tracked only the campaign planes — ledger items and matrix rows.
 * That was the wrong scope, and an external review caught it the expensive way: the walls changed
 * across two review waves and roughly a dozen commits, and no delta ever fired. Every dependent
 * seat kept operating on a mental model of guards that had already moved underneath it.
 *
 * A seat must be TOLD when the walls change. Otherwise "the harness got stronger" and "every seat
 * knows the harness got stronger" are different facts, and only the first one was ever true.
 *
 * Hashes rather than contents: the digest reports THAT the enforcement surface moved and which
 * area, never a diff. A per-turn diff of the hook chain would be its own context tax, which is the
 * thing this module exists to avoid.
 */
const ENFORCEMENT_AREAS: readonly { readonly key: string; readonly glob: string; readonly cwd: string }[] = [
  { key: "walls:hooks", glob: "**/*.ts", cwd: ".claude/hooks" },
  { key: "walls:gates", glob: "*.ts", cwd: "dev/gates" },
  { key: "walls:rules", glob: "**/rules/*.yml", cwd: ".rules" },
  { key: "walls:corpus", glob: "corpus.toml", cwd: "dev/walls" },

  // THE WIRING, not just the code. The first version watched what the walls DO and not whether
  // they are plugged in — and every one of these can move the enforcement plane without touching
  // a single line of wall logic:
  //   settings.json   the matcher, the deny rules, which events are even dispatched
  //   githooks/       whether the staged gate runs at commit time at all
  //   package.json    the gate CHAIN — dropping `gate:ratchet` from one line leaves CI green with
  //                   the load-bearing defence never invoked
  //   sgconfig.yml    which rule directories are scanned
  // A legitimate, granted edit to any of them is exactly the case where dependent seats most need
  // to be told, because nothing about it looks like a weakening in a diff.
  { key: "walls:wiring", glob: "settings.json", cwd: ".claude" },
  { key: "walls:githooks", glob: "*", cwd: "dev/githooks" },
  { key: "walls:chain", glob: "package.json", cwd: "." },
  { key: "walls:sgconfig", glob: "sgconfig.yml", cwd: "." },
];

async function hashArea(root: string, cwd: string, glob: string): Promise<string> {
  const names = await Array.fromAsync(new Bun.Glob(glob).scan({ cwd: `${root}/${cwd}` })).catch(
    () => [] as string[],
  );
  if (names.length === 0) return "absent";

  // Sorted, so the hash depends on content and not on filesystem enumeration order.
  const hasher = new Bun.CryptoHasher("sha256");
  for (const name of names.sort()) {
    hasher.update(name);
    hasher.update(await Bun.file(`${root}/${cwd}/${name}`).text().catch(() => ""));
  }
  return hasher.digest("hex").slice(0, 12);
}

async function snapshot(root: string): Promise<Snapshot> {
  const state: Snapshot = {};

  const ledger = await readLines(`${root}/${LEDGER}`).catch(() => null);
  if (ledger !== null) {
    for (const block of locateItems(ledger)) state[`item:${block.item.id}`] = block.item.status;
  }

  const matrixText = await Bun.file(`${root}/${MATRIX}`).text().catch(() => null);
  if (matrixText !== null) {
    const parsed = Bun.TOML.parse(matrixText) as { rows?: readonly Record<string, unknown>[] };
    for (const row of parsed.rows ?? []) {
      state[`row:${String(row["id"] ?? "")}`] = String(row["status"] ?? "");
    }
  }

  for (const area of ENFORCEMENT_AREAS) {
    state[area.key] = await hashArea(root, area.cwd, area.glob);
  }

  // HEAD moving is how a seat learns another seat landed something at all.
  const head = await Bun.$`git -C ${root} rev-parse --short HEAD`.quiet().nothrow().text();
  if (head.trim() !== "") state["repo:HEAD"] = head.trim();

  return state;
}

export const module: HookModule = {
  order: 12,
  name: "12-delta-digest",
  events: ["UserPromptSubmit"],

  async run(payload: HookPayload): Promise<HookVerdict> {
    const root = payload.cwd ?? process.cwd();
    const current = await snapshot(root);
    const path = statePath(root, payload.session_id);

    const previous = (await Bun.file(path).json().catch(() => null)) as Snapshot | null;

    await Bun.write(path, JSON.stringify(current));
    await pruneStaleState(root);

    // First run has no baseline. Record it and stay silent — a "here is everything" dump on the
    // first turn is precisely the noise this module exists to avoid.
    if (previous === null) return null;

    const changes: string[] = [];
    for (const [key, status] of Object.entries(current)) {
      const before = previous[key];
      if (before === undefined) changes.push(`+ ${key} (${status})`);
      else if (before !== status) changes.push(`~ ${key}: ${before} → ${status}`);
    }
    for (const key of Object.keys(previous)) {
      if (!(key in current)) changes.push(`- ${key}`);
    }

    if (changes.length === 0) return null;

    const shown = changes.slice(0, MAX_LINES);
    const overflow = changes.length > MAX_LINES ? [`  (+${changes.length - MAX_LINES} more)`] : [];

    // A wall moving is a different kind of news from an item moving, and it deserves to be said
    // in words rather than left as an opaque hash pair the reader has to decode.
    const wallsMoved = changes.some((line) => line.includes("walls:"));
    const banner = wallsMoved
      ? [
          `⚠ THE ENFORCEMENT SURFACE CHANGED since your last turn.`,
          `  A guard you are relying on may no longer do what you believe it does.`,
          `  Re-read before working around any refusal:`,
          `    bun run gate`,
          // Names every area actually watched. The first version listed only the wall CODE, so a
          // seat told that the surface moved was then pointed at three of the eight places it
          // could have moved — and the wiring files are precisely the ones whose change does not
          // read as a weakening in a diff.
          `    git log -p -- .claude/hooks .claude/settings.json dev/gates dev/githooks .rules \\`,
          `                  dev/walls/corpus.toml sgconfig.yml package.json`,
          ``,
        ]
      : [];

    return {
      kind: "context",
      text: [
        ...banner,
        `LEDGER DELTA since your last turn`,
        ...shown.map((line) => `  ${line}`),
        ...overflow,
      ].join("\n"),
    };
  },
};

export default module;
