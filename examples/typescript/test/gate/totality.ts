// ── C13 — registry totality ────────────────────────────────────────────────
// The one check in §9 that is a question about VALUES rather than syntax, so it
// is a vitest check rather than a lint rule (§9's own C13 row says so).
//
// It has two halves, and both are load-bearing:
//
//   COMPILE TIME  `Record<OkResult["tool"], true>` in test/app/totality.test.ts
//                 is a mapped type over the union's own discriminant. Add a
//                 ToolResult case and that table stops compiling.
//   RUN TIME      the function below: every name in that table resolves to a
//                 registered verb, that verb is classified (14.3's default-deny
//                 has no default), and it signs — the name→Command half of 6.8.
//
// Exported so the SAME function runs in the allow-test (the shipped registry)
// and the block-test (a registry with a verb pulled out of it). One checker,
// two inputs — a check nobody has watched deny is not a check.

import type { Signature } from "../../src/spine/pure/actor";
import type { CommandBase } from "../../src/spine/pure/command";
import type { ToolResultBase } from "../../src/spine/pure/tool-result";
import type { Verb } from "../../src/spine/pure/verb";

/** The shape C13 needs; `Registry<S>` satisfies it. */
export type VerbTable = ReadonlyMap<string, Verb<never>>;

const PROBE: Signature = { by: "Agent", authority: "gate-probe" as Signature["authority"] };

/** Every way a registry can fail to be total. Empty means C13 passes. */
export function registryGaps(declared: readonly string[], registry: VerbTable): readonly string[] {
  const gaps = declared.flatMap((tool) => {
    const verb = registry.get(tool);
    if (verb === undefined) return [`"${tool}" is a declared ToolResult case with no Verb entry`];
    if (verb.kind !== "Reversible" && verb.kind !== "Irreversible") {
      return [`"${tool}" is registered but unclassified — 14.3's default-deny has no default`];
    }
    return signs(tool, verb) ? [] : [`"${tool}" is registered but does not sign — 6.8's name→Command map has a hole`];
  });
  const orphans = [...registry.keys()]
    .filter((tool) => !declared.includes(tool))
    .map((tool) => `"${tool}" is registered but is not a declared ToolResult case`);
  return [...gaps, ...orphans];
}

function signs(tool: string, verb: Verb<never>): boolean {
  const result = { outcome: "ok", tool } as unknown as ToolResultBase;
  const cmd: CommandBase = verb.sign(result, PROBE, "gate-probe-id");
  return cmd.tool === tool && cmd.id === "gate-probe-id" && cmd.sig === PROBE;
}
