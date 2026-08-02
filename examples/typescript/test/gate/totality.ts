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
import type { ResultOutcome, ToolResultBase } from "../../src/spine/pure/tool-result";
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

// ── OWNERSHIP TOTALITY — the same question one seam EARLIER ───────────
// The two checkers above ask whether the ROOT's tables are total. This one asks
// whether each BLOCK's answer to "is this result mine?" still matches the verbs
// that block registers, and it is the third totality question because the root
// dispatches on that answer: `foldOk` walks the blocks asking `owns(r)`, and a
// result no block claims reaches the unclaimed arm instead of a fold.
//
// IT IS A BEHAVIOURAL PROBE, NEVER A READ OF SOURCE. The predicate is EXERCISED
// over the whole live vocabulary and the set it accepts is compared with the set
// its block registers. Enumerating spellings has been defeated repeatedly in
// this tree — an alias, a wildcard import, a computed key — and every one of
// those defeats a reader. None of them survives being called.
//
// The predicate is probed on the TWO DISCRIMINANTS AND NOTHING ELSE, which is
// itself part of the rule rather than a convenience: 6.8 makes the tool name the
// discriminant of the result, the key of the registry and the name of the
// Command, so a block that needed a payload field to recognise its own result
// would be saying the discriminant is not one.
//
// Exported so the SAME function runs over the shipped blocks and over a census
// with one block's predicate deliberately moved — one checker, two inputs, the
// shape §15.2 requires of a check whose subject is VALUES.
//
// NAMED RESIDUE, because a probe is only as wide as its candidate set. The
// vocabulary is the union of what the blocks THEMSELVES register, plus one
// sentinel — so a predicate claiming a name that has vanished from every table
// at once is visible to this checker only through that sentinel. That case is
// not left uncovered, it is covered ONE SEAM OVER: a name a block can claim is
// a name in that block's own union, `registryGaps` above refuses a declared
// case with no registered verb, and the caller derives its declared set from
// the app union's own discriminant. The two checkers close it together; neither
// closes it alone, and this comment is here so that is a stated composition
// rather than a gap a reader has to find.

/** One block's answer to "which results are mine?", as data: the tool names its
 *  own registration carries, and the predicate the root dispatches on. */
export interface BlockOwnership {
  readonly block: string;
  readonly tools: readonly string[];
  readonly owns: (r: ToolResultBase) => boolean;
}

/** A tool name no block registers. The probe carries it so that a predicate
 *  claiming a name NOTHING in the system produces is caught — an over-claim
 *  against the live vocabulary alone would miss it, because the vocabulary is
 *  where the check gets its candidates from. */
export const UNREGISTERED_TOOL = "unregisteredProbeTool";

/** The spine's own two outcomes. A block never claims one: `foldOne` sends both
 *  to the spine's arm before any block is asked. */
const SPINE_OUTCOMES = ["unhandled", "refused"] as const;

const probe = (outcome: ResultOutcome, tool: string): ToolResultBase => ({ outcome, tool });

/** Every way a block's `owns` can have drifted from the verbs it registers.
 *  Empty means each block claims exactly its own table and nothing else. */
export function ownershipGaps(blocks: readonly BlockOwnership[]): readonly string[] {
  const vocabulary = [...new Set([...blocks.flatMap((b) => b.tools), UNREGISTERED_TOOL])].sort();
  return blocks.flatMap((b) => {
    const registered = new Set(b.tools);
    const claimed = vocabulary.filter((tool) => b.owns(probe("ok", tool)));
    const under = [...registered]
      .filter((tool) => !claimed.includes(tool))
      .sort()
      .map((tool) => `"${b.block}" registers "${tool}" but its \`owns\` does not claim it`);
    const over = claimed
      .filter((tool) => !registered.has(tool))
      .map((tool) => `"${b.block}" claims "${tool}" but registers no verb of that name`);
    const spine = SPINE_OUTCOMES.filter((outcome) =>
      vocabulary.some((tool) => b.owns(probe(outcome, tool))),
    ).map(
      (outcome) =>
        `"${b.block}" claims a result whose outcome is "${outcome}" — the spine's own arm folds those, never a block`,
    );
    return [...under, ...over, ...spine];
  });
}
