#!/usr/bin/env bun
/**
 * THE GRANT TOKEN PATH HAS EXACTLY ONE READER, AND IT IS NOT THIS FILE'S JOB TO BE POLITE ABOUT IT.
 *
 * `grantPath()` is private to `.claude/hooks/grant-store.ts` (N22), so importing it is a type
 * error and `gate:types` catches it. This gate is the backstop for the other route: writing the
 * path out by hand.
 *
 * WHY IT MATTERS. Asking "does the token file exist" is not the same question as "is a grant
 * live". `revoke()` deletes the token; expiry does not. `dev/gates/ratchet.ts` asked the file
 * question for ten review rounds, so an expired grant blocked the load-bearing gate indefinitely
 * while every other reader — all calling liveGrant() — correctly saw no grant (N21). One reader
 * bypassing the shared checker is the shape of nearly every hole this harness has had.
 *
 * The expired token is deliberately left on disk: it carries reason/grantedBy/sessionId and IS the
 * audit trail the grant exists to leave. Deleting it on read was considered and rejected — it
 * destroys the receipt, and a stale reader would then misread only when it ran first, which trades
 * a deterministic bug for an ordering-dependent one.
 *
 * So the dead state stays and the QUESTION is what gets walled off. Read it through liveGrant().
 *
 *   bun dev/gates/grant-path-wall.ts             # scan tracked TypeScript
 *   bun dev/gates/grant-path-wall.ts --selftest
 *
 * NOTE THE NEEDLE IS BUILT, NOT WRITTEN. If this file contained the literal it would match itself
 * and need a self-exemption — which is exactly the shape that made `no-python-invocation` fire on
 * the filename `dev/gates/no-python.ts`. A rule that has to exempt itself is a rule with a hole in
 * the same place every time.
 *
 * WHAT THIS CATCHES IS THE LITERAL, NOT THE CONCEPT. The very trick above — assembling the string
 * from fragments — walks straight past this wall, and no string scan can close that. Stated
 * because the sentence before it calls this "the backstop for hardcoding", and a built-string
 * hardcode IS hardcoding: the claim would otherwise outrun the mechanism, which is the one thing
 * every other finding this session has been about.
 *
 * That is a deliberate limit, not an oversight, and it is where the layering does the work:
 *   - `tsc` is the STRUCTURAL layer — grantPath is un-exported, so the honest route is unwritable.
 *   - this wall is the LEGIBILITY layer — it catches the next honest N21, someone reaching for the
 *     path because it was the obvious thing to reach for.
 *   - nothing here stops a seat that deliberately assembles the path to evade a guard, and on a
 *     NOPASSWD-root host nothing could. What it must do instead is make that attempt CONSPICUOUS:
 *     string-building a path that a one-line import would have given you is not something a diff
 *     reader glosses over. Detection you cannot erase, not prevention you cannot enforce.
 */
const NEEDLE = [".grant", ".json"].join("");

/** The one file allowed to name the token. It owns the path; everyone else owns a question. */
const OWNER = ".claude/hooks/grant-store.ts";

/**
 * Pure, so the witness needs no sandbox.
 *
 * Five separate witnesses in this repo each built their own throwaway git repo and each got it
 * wrong differently. The cheapest way not to be the sixth is to have nothing to build: the check
 * is a function of (path, text), and the selftest calls it with strings.
 */
export function offenders(files: readonly { path: string; text: string }[]): string[] {
  return files
    .filter((file) => file.path !== OWNER && file.text.includes(NEEDLE))
    .map((file) => file.path);
}

if (import.meta.main) {
  if (Bun.argv.includes("--selftest")) {
    await selftest();
    process.exit(0);
  }

  const root = (await Bun.$`git rev-parse --show-toplevel`.quiet().nothrow().text()).trim() || ".";
  // Filter in TS, NOT with a `-- *.ts` pathspec: Bun.$ escapes the glob, git receives a literal
  // filename, and the scan silently matches zero files. Caught by the non-empty assertion below on
  // this gate's very first run — which is the whole argument for having it.
  const listed = await Bun.$`git -C ${root} ls-files -z`.quiet().nothrow().text();
  const paths = listed.split("\0").filter((path) => path.endsWith(".ts"));

  const files = await Promise.all(
    paths.map(async (path) => ({ path, text: await Bun.file(`${root}/${path}`).text() })),
  );

  // A scan that matched nothing because it READ nothing is the false pass this repo has already
  // manufactured once, on an exit code. Assert the corpus is non-empty and that the owner is in it.
  if (!paths.includes(OWNER)) {
    console.error(
      `grant-path-wall: ${OWNER} is not among the ${paths.length} tracked .ts file(s) scanned.\n` +
        `  Either the store moved or the file list is wrong. A clean result from a scan that did\n` +
        `  not read the one file it is about is not a clean result.`,
    );
    process.exit(2);
  }

  const bad = offenders(files);
  if (bad.length === 0) {
    console.log(`grant-path-wall: clean · ${paths.length} file(s), 1 owner`);
    process.exit(0);
  }

  console.error(`grant-path-wall: ${bad.length} file(s) name the grant token path directly\n`);
  for (const path of bad) console.error(`  ${path}`);
  console.error(
    `\nOnly ${OWNER} may name it. Everywhere else, import liveGrant() and ask whether a grant is\n` +
      `LIVE — the file existing is a different question, and answering the wrong one is N21: an\n` +
      `expired token blocked the load-bearing gate for ten review rounds because revoke() deletes\n` +
      `the file and expiry does not.`,
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

  console.log("grant-path-wall selftest");

  const names = `const p = "${"${root}"}/.claude/${NEEDLE}";`;
  const clean = `import { liveGrant } from "./grant-store.ts";`;

  // The premise: the fixture text really does contain the needle. Without this, every "is caught"
  // case below would also pass if NEEDLE were built wrong and matched nothing at all.
  check("the offending fixture really contains the needle (the premise)", names.includes(NEEDLE));

  check("a file naming the token path is caught", offenders([{ path: "dev/gates/x.ts", text: names }]).length === 1);
  check("a file asking liveGrant is not", offenders([{ path: "dev/gates/x.ts", text: clean }]).length === 0);
  check("the owner may name it", offenders([{ path: OWNER, text: names }]).length === 0);
  check(
    "the owner exemption is by exact path, not suffix",
    offenders([{ path: `vendor/${OWNER}`, text: names }]).length === 1,
  );
  check(
    "every offender is reported, not just the first",
    offenders([
      { path: "a.ts", text: names },
      { path: "b.ts", text: clean },
      { path: "c.ts", text: names },
    ]).length === 2,
  );

  // THIS FILE must not match itself — the needle is built rather than written for exactly that
  // reason, and a later edit pasting the literal in would silently re-introduce the self-exemption
  // problem that made no-python-invocation fire on its own filename.
  const self = await Bun.file(import.meta.path).text();
  check("this gate does not contain the literal it hunts", !self.includes(NEEDLE));

  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}
