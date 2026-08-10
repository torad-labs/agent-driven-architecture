/**
 * LAW INJECTION — the laws re-arrive at every session boundary.
 *
 * A seat that has lost the laws is not merely less informed; it is actively dangerous, because it
 * is still holding write access to a tree shaped by rules it can no longer recall. It will read a
 * guard's refusal as an obstacle rather than as a decision someone made for a reason, and the
 * shortest path past an obstacle is to remove it.
 *
 * So the laws are re-read FROM THE LEDGER at SessionStart and PreCompact — never from this file.
 * A copy here would drift from the ledger the first time a law was amended, and the drifted copy
 * is what the next session would believe. The ledger header is the single source; this module is
 * only a delivery mechanism.
 */

import { headerLines, readLines } from "../../../dev/campaigns/ledger-core.ts";
import { LEDGER, REPO_NAME } from "../repo.ts";
import type { HookModule, HookPayload, HookVerdict } from "../types.ts";


export const module: HookModule = {
  order: 10,
  name: "10-law-injection",
  events: ["SessionStart", "PreCompact"],

  async run(payload: HookPayload): Promise<HookVerdict> {
    const root = payload.cwd ?? process.cwd();
    const lines = await readLines(`${root}/${LEDGER}`).catch(() => null);
    if (lines === null) return null;

    const laws = headerLines(lines)
      .filter((line) => line.trimStart().startsWith("# LAW:"))
      .map((line) => line.replace(/^\s*#\s*LAW:\s?/, "  "));

    if (laws.length === 0) return null;

    return {
      kind: "context",
      text: [
        `${REPO_NAME.toUpperCase()} LAWS IN FORCE (read from ${LEDGER}, not from the hook)`,
        ``,
        ...laws,
        ``,
        `These are not advice. Walls enforce several of them mechanically and will refuse writes.`,
        `A refusal is a decision someone made for a reason — read the reason before working around`,
        `it, and if the wall is genuinely wrong, fix the wall with a red-green proof.`,
        ``,
        `Ledger:    bun dev/campaigns/ledger.ts ${LEDGER} next`,
        `Matrix:    bun dev/matrix.ts dev/matrix.toml list`,
        `Manifest:  bun dev/manifest.ts dev/manifests/compose-flow.toml list`,
        `Gate:      bun run gate`,
      ].join("\n"),
    };
  },
};

export default module;
