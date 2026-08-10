#!/usr/bin/env bun
/**
 * THE BEACON WATCHER — the alarm for the sensor.
 *
 * `13-stop-beacon` writes `.claude/.stop-beacon.json` every time a turn ends, recording what was
 * still open. Until now nothing ever read it, which made it a sensor with no alarm: the state was
 * observable in principle and observed by nobody. An external review named that correctly.
 *
 * The law it enforces is `silence-is-a-system-bug`: an idle seat with a non-empty queue is a
 * defect, not a pause. That distinction can only be drawn from OUTSIDE the session — from inside,
 * "finished" and "died" look identical — which is why this is a separate entry point and not
 * another hook module.
 *
 *   bun dev/gates/beacon-check.ts             # human read
 *   bun dev/gates/beacon-check.ts --max-idle 30m   # exit 1 if quiet too long with work open
 *   watch -n60 'bun dev/gates/beacon-check.ts --max-idle 30m'   # the actual alarm
 *
 * NOT in `bun run gate`. The gate answers "is the tree correct"; this answers "is the seat alive",
 * and a gate that fails because nobody has typed for an hour would be noise that gets silenced.
 */

type Beacon = {
  readonly at?: string;
  readonly session?: string | null;
  readonly in_flight?: readonly string[];
  readonly todo_count?: number;
  readonly silent_with_queue?: boolean;
};

function parseDuration(text: string): number | null {
  const match = text.trim().match(/^(\d+)(s|m|h)$/i);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const unit = { s: 1_000, m: 60_000, h: 3_600_000 }[match[2].toLowerCase()] ?? 0;
  return Number(match[1]) * unit;
}

const argv = Bun.argv.slice(2);
const maxIdleArg = argv[argv.indexOf("--max-idle") + 1];
const maxIdle = argv.includes("--max-idle") ? parseDuration(maxIdleArg ?? "") : null;
if (argv.includes("--max-idle") && maxIdle === null) {
  console.error(`beacon: --max-idle wants <n>s|m|h, got ${JSON.stringify(maxIdleArg ?? "")}`);
  process.exit(2);
}

const root = (await Bun.$`git rev-parse --show-toplevel`.quiet().nothrow().text()).trim() || ".";
const beacon = (await Bun.file(`${root}/.claude/.stop-beacon.json`).json().catch(() => null)) as Beacon | null;

if (beacon === null) {
  // Absent is not an alarm. It means no turn has ended in this checkout yet — a fresh clone, or a
  // session still on its first turn. Reporting it as a failure would cry wolf on day one.
  console.log("beacon: none yet (no turn has ended in this checkout)");
  process.exit(0);
}

const at = Date.parse(beacon.at ?? "");
if (!Number.isFinite(at)) {
  console.error("beacon: unreadable timestamp — the beacon file is corrupt, which is itself a defect");
  process.exit(1);
}

const idleMs = Date.now() - at;
const idleMin = Math.round(idleMs / 60_000);
const inFlight = beacon.in_flight ?? [];
const queued = beacon.todo_count ?? 0;
const hasWork = inFlight.length > 0 || queued > 0;

const lines = [
  `beacon: last turn ended ${idleMin}m ago (session ${beacon.session ?? "unknown"})`,
  `  in_flight : ${inFlight.length === 0 ? "(none)" : inFlight.join(", ")}`,
  `  todo      : ${queued}`,
];

if (maxIdle === null) {
  console.log(lines.join("\n"));
  process.exit(0);
}

if (hasWork && idleMs > maxIdle) {
  console.error(
    [
      ...lines,
      ``,
      `SILENCE WITH A NON-EMPTY QUEUE.`,
      `  The seat has been quiet for ${idleMin}m with work still open. Under the`,
      `  silence-is-a-system-bug law that is a defect, not a pause — either the seat died, or it`,
      `  stopped without closing out. Check the session, then either resume it or leave a dated`,
      `  note on the open items saying where they actually stand. A stale in_flight is how a`,
      `  campaign starts lying to the next reader.`,
    ].join("\n"),
  );
  process.exit(1);
}

console.log([...lines, `  within the ${Math.round(maxIdle / 60_000)}m idle budget`].join("\n"));
process.exit(0);
