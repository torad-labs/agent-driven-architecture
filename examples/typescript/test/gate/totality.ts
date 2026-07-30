// ── C13 — TOTALITY, both halves: the verb registry and the effect handlers ─
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

import { Signature } from "../../src/spine/pure/actor";
import type { CommandBase } from "../../src/spine/pure/command";
import type { ToolResultBase } from "../../src/spine/pure/tool-result";
import type { Verb } from "../../src/spine/pure/verb";

/** The shape C13 needs; `Registry<S>` satisfies it. */
export type VerbTable = ReadonlyMap<string, Verb<never>>;

const PROBE = new Signature("Agent", "gate-probe" as Signature["authority"]);

/** Every way a registry can fail to be total. Empty means C13 passes. */
export function registryGaps(declared: readonly string[], registry: VerbTable): readonly string[] {
  const gaps = declared.flatMap((tool) => {
    const verb = registry.get(tool);
    if (verb === undefined) return [`"${tool}" is a declared ToolResult case with no Verb entry`];
    if (verb.kind !== "Reversible" && verb.kind !== "Irreversible") {
      return [`"${tool}" is registered but unclassified — 14.3's default-deny has no default`];
    }
    return signs(tool, verb)
      ? []
      : [`"${tool}" is registered but does not sign — 6.8's name→Command map has a hole`];
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

// ── C13's SECOND half: HANDLER totality ──────────────────────────────
// Same question one seam over. `registryGaps` asks "does every declared result
// case have a verb that signs?"; this asks "does every declared effect kind have
// a registered handler, and does every registered handler answer a declared
// kind?".
//
// It is the same checker shape for the same reason: a question about VALUES
// carries its block/allow pair as two INPUTS rather than two trees on disk. The
// ALLOW half runs it over the shipped dispatcher; the BLOCK half pulls one
// handler out and watches it deny.
//
// `declared` is NOT a list this file invents. Its caller derives it from
// `Record<Effect["kind"], true>` — a mapped type over the live union's own
// discriminant — so a renamed or added kind breaks the derivation loudly instead
// of leaving this checker matching nothing. That is the C7 rot, refused in
// advance.

/** Every way an assembled handler table can fail to be total. Empty means it passes. */
export function handlerGaps(
  declared: readonly string[],
  handlers: Readonly<Record<string, unknown>>,
): readonly string[] {
  const gaps = declared
    .filter((kind) => typeof handlers[kind] !== "function")
    .map((kind) => `"${kind}" is a declared Effect kind with no registered handler`);
  const orphans = Object.keys(handlers)
    .filter((kind) => !declared.includes(kind))
    .map((kind) => `"${kind}" has a registered handler but is not a declared Effect kind`);
  return [...gaps, ...orphans];
}
