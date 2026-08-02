// ── C13, BOTH HALVES — and the AI SDK binding that still works ─────────────
// Every "ok" ToolResult case has a Verb entry and a `sign` branch; every declared
// `Effect` kind has a registered handler; and the runtime binding drives the
// whole thing offline.
//
// THE TWO LEDGERS IN THIS FILE ARE THE GATE'S OWN, and they are the out-of-folder
// cost of a new case in each half: `EXPECTED` below for a new VERB (twelve
// entries, pre-dating the handler split) and `EXPECTED_EFFECTS` further down for
// a new EFFECT KIND. Both are mapped types over the live union's own
// discriminant, which is what stops the runtime checkers beneath them going
// vacuous — the exact failure C7's derivation shipped.

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { fold } from "../../src/app/assemble";
import type { Effect, OkResult } from "../../src/app/contract";
import { initialState } from "../../src/app/contract";
import type { Ports } from "../../src/app/wire";
import {
  ALL_BLOCKS,
  DEEP_TIER,
  effectHandlers,
  effectSink,
  offlinePorts,
  wireApp,
} from "../../src/app/wire";
import { analysis } from "../../src/blocks/analysis/register";
import { artifact } from "../../src/blocks/artifact/register";
import { consoleBlock } from "../../src/blocks/console/register";
import type { PageOncall } from "../../src/blocks/escalation/register";
import { escalation } from "../../src/blocks/escalation/register";
import { inbox } from "../../src/blocks/inbox/register";
import { triage } from "../../src/blocks/triage/register";
import { runTurn } from "../../src/spine/agent/loop";
import { signResult } from "../../src/spine/boundary/action";
import { handlerSink, movingClock } from "../../src/spine/boundary/in-memory";
import { authority, Signature } from "../../src/spine/pure/actor";
import type { Handlers } from "../../src/spine/pure/effect";
import { admit, ORPHAN_EFFECT } from "../../src/spine/pure/effect";
import type { Timestamp } from "../../src/spine/pure/ids";
import { keyedEffect } from "../../src/spine/pure/keyed-effect";
import type { ToolResultBase } from "../../src/spine/pure/tool-result";
import { refused, seal } from "../../src/spine/pure/tool-result";
import type { BlockOwnership } from "../gate/totality";
import { handlerGaps, ownershipGaps, UNREGISTERED_TOOL } from "../gate/totality";
import { AGENT_RUN, harness } from "../harness";
import { must } from "../support/must";

// A compile-time half: this table must name every "ok" tool in the system, and
// the compiler fails the build if the union grows past it (mapped type over the
// union's own discriminant).
const EXPECTED: Record<OkResult["tool"], true> = {
  setPriority: true,
  requestEscalation: true,
  confirmEscalation: true,
  focusTicket: true,
  setPanel: true,
  recordFinding: true,
  requestSeal: true,
  confirmSeal: true,
  recallAnalysis: true,
  publishAnalysis: true,
  noteDrop: true,
  noteFault: true,
};

const sig = new Signature("Agent", authority("agent-run-7f"));

describe("C13 — the verb-registry half", () => {
  it("every declared verb is registered, and every registered verb signs", () => {
    const { app } = harness();
    expect([...app.registry.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());

    for (const verb of app.registry.values()) {
      expect(verb.kind === "Reversible" || verb.kind === "Irreversible").toBe(true);
      expect(typeof verb.describe).toBe("string");
      expect(verb.describe.length).toBeGreaterThan(0);
    }
  });

  it("the spine's own two cases sign too — a refusal is a decision (5.4)", () => {
    const { app } = harness();
    expect(signResult(app.registry, seal(refused("confirmSeal", "nope")), sig, "c9")).toEqual({
      outcome: "refused",
      tool: "confirmSeal",
      sig,
      id: "c9",
      reason: "nope",
    });
  });
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("the runtime binding — the boundary is hooked onto onStepFinish", () => {
  it("runs a real generateText loop offline and folds what the AGENT asked for", async () => {
    const h = harness();
    let call = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        call += 1;
        if (call === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "t1",
                toolName: "setPriority",
                input: JSON.stringify({ ticket: "4118", level: "High" }),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage,
            warnings: [],
          };
        }
        return {
          content: [{ type: "text" as const, text: "Priority set to High." }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        };
      },
    });

    const out = await runTurn({
      model,
      prompt: "ticket 4118 looks urgent",
      boundary: h.app.boundary,
      registry: h.app.registry,
      dispatchers: h.app.dispatchers,
    });

    expect(out.steps).toBe(2);
    expect(h.app.boundary.state.triage.priority.get("4118")).toBe("High");
    // the loop forwarded an ACTION; the boundary produced the recorded result
    expect(must(h.app.bus.records()[0]).actions).toEqual([
      { tool: "setPriority", input: { ticket: "4118", level: "High" } },
    ]);
    expect(must(h.app.bus.records()[0]).commands[0]).toMatchObject({
      tool: "setPriority",
      sig: { by: "Agent" },
    });
    expect(h.sink.performed.map((k) => k.effect.kind)).toEqual(["LogDecision"]);
  });
});

// ── The floor under block dispatch (§6.5) ──────────────────────────────────
// `foldOk`'s ownership chain is type predicates, and TypeScript TRUSTS a
// predicate it cannot verify. A block whose `owns` goes stale therefore narrows
// the result to `never` at compile time while a real value flows through at
// runtime — tsc exit 0, eslint exit 0, every test green, and then the fold
// returned `undefined` and the caller died on `out.effects is not iterable`.
//
// A crash out of the one arm 6.5 says must never crash. This pins the fix: the
// unclaimed result folds like any unknown tool name — no transition, one
// diagnostic, one notice naming the tool. Total AND observable.
describe("an unclaimed result folds observably instead of crashing (§6.5)", () => {
  it("emits a diagnostic and a notice rather than returning undefined", () => {
    const state = initialState({ tickets: [{ id: "4118", body: "refund not received" }] });
    const sig = new Signature("Agent", AGENT_RUN);
    const stale = { outcome: "ok", tool: "resolveTicket", ticket: "4118" } as never;

    const out = fold(state, [stale], 1 as Timestamp, sig);

    expect(out.effects).toHaveLength(1);
    // The fold's output is ATTRIBUTED now (docs/DECISIONS.md:85): each effect
    // rides the committed result it came from, and the ONLY way to read what an
    // arm emitted is the admission rule itself — which passes a `Routine`
    // effect through untouched, licence or no licence.
    expect(admit(new Set(), out.effects)[0]).toMatchObject({ kind: "Diag" });
    const notices = out.state.spine.notices;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "Rejected", tool: "resolveTicket" });
    // no block slice advanced
    expect(out.state.triage).toEqual(state.triage);
  });
});

// ── THE HARDENING OVER THAT FLOOR — `owns` is derived, and watched ────────
// The floor above keeps an unclaimed result from crashing. It does not stop one
// EXISTING: `owns` was a hand-kept clause, and a verb added without it left the
// build green and the result unclaimed.
//
// TWO LAYERS CLOSE THAT, and neither is the other's spare. THE COMPILER holds
// the union half: each predicate is now derived from a claim table that is a
// mapped type over its own block's result union (`spine/pure/tool-result`), so a
// case declared and a case claimed are one edit — proven must-fail in both
// directions by the `owns-under-claim` and `owns-over-claim` fixtures in
// test/gate/exhaustiveness.test.ts. THIS CHECK holds the half no type can: that
// the union a block claims is still the set of verbs it REGISTERS. Between the
// two there is nowhere left for the stale half to live.
//
// The census is the root's own allowlist beside the six published predicates,
// and it is cross-checked against the block folders on disk — a seventh block
// joins by existing, rather than by being remembered here.
const BLOCKS_DIR = join(dirname(new URL(import.meta.url).pathname), "..", "..", "src", "blocks");

type Owns = (r: ToolResultBase) => boolean;

const OWNS: ReadonlyMap<string, Owns> = new Map<string, Owns>([
  [triage.name, triage.owns],
  [escalation.name, escalation.owns],
  [consoleBlock.name, consoleBlock.owns],
  [artifact.name, artifact.owns],
  [analysis.name, analysis.owns],
  [inbox.name, inbox.owns],
]);

const liveOwnership: readonly BlockOwnership[] = ALL_BLOCKS.map((registration) => ({
  block: registration.block,
  tools: registration.verbs.map((verb) => verb.name),
  owns: must(OWNS.get(registration.block)),
}));

/** One block's predicate replaced, everything else the shipped census. The
 *  block-halves below are INPUTS to the same checker the allow-half runs. */
const withOwns = (block: string, owns: Owns): readonly BlockOwnership[] =>
  liveOwnership.map((entry) => (entry.block === block ? { ...entry, owns } : entry));

describe("ownership totality — a block claims exactly the verbs it registers", () => {
  it("the census reads every block on disk, and the whole verb vocabulary", () => {
    // A census that had quietly stopped reading the tree would report silence,
    // which is the vacuous-check failure this repository has shipped before.
    const onDisk = readdirSync(BLOCKS_DIR).sort();
    expect(liveOwnership.map((b) => b.block).sort()).toEqual(onDisk);
    expect([...OWNS.keys()].sort()).toEqual(onDisk);
    // …and the vocabulary is this file's OWN compile-time ledger, derived rather
    // than pinned a second time, so a verb costs no new out-of-folder site here.
    expect(liveOwnership.flatMap((b) => b.tools).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("ALLOWS the shipped blocks — every `owns` matches its own registration", () => {
    expect(ownershipGaps(liveOwnership)).toEqual([]);
  });

  it("DENIES a block whose `owns` UNDER-CLAIMS its own verb table", () => {
    const stale = withOwns("console", (r) => r.outcome === "ok" && r.tool === "focusTicket");
    expect(ownershipGaps(stale)).toEqual([
      '"console" registers "setPanel" but its `owns` does not claim it',
    ]);
  });

  it("DENIES a block that claims a verb a SIBLING registers", () => {
    const greedy = withOwns(
      "inbox",
      (r) => inbox.owns(r) || (r.outcome === "ok" && r.tool === "setPriority"),
    );
    expect(ownershipGaps(greedy)).toEqual([
      '"inbox" claims "setPriority" but registers no verb of that name',
    ]);
  });

  it("DENIES a block that claims a name NOTHING in the system registers", () => {
    const phantom = withOwns(
      "triage",
      (r) => triage.owns(r) || (r.outcome === "ok" && r.tool === UNREGISTERED_TOOL),
    );
    expect(ownershipGaps(phantom)).toEqual([
      `"triage" claims "${UNREGISTERED_TOOL}" but registers no verb of that name`,
    ]);
  });

  it("DENIES a predicate blind to `outcome` — the spine's two cases are never a block's", () => {
    const blind = withOwns("triage", (r) => r.tool === "setPriority");
    expect(ownershipGaps(blind)).toEqual([
      '"triage" claims a result whose outcome is "unhandled" — the spine\'s own arm folds those, never a block',
      '"triage" claims a result whose outcome is "refused" — the spine\'s own arm folds those, never a block',
    ]);
  });
});

// ── C13, handler half — every effect kind has exactly one handler ─────────
// The COMPILE-TIME half is the table below: a mapped type over the live union's
// own discriminant, so an effect kind added anywhere in the system stops this
// file compiling until it is named here. That is what stops the runtime checker
// beneath it from going vacuous — the exact failure C7's derivation shipped, and
// it is also, stated plainly, the ONE out-of-folder site a novel effect kind
// costs in this port. The verb half above has always cost the same.
//
// The RUN-TIME half is `handlerGaps`, run twice over the SAME assembly: once
// whole, once with a handler pulled out. And the BLOCK half is driven through a
// real `Sink` built the way the app builds one, not by calling the floor
// function directly — a test that calls the floor proves the function exists,
// not that anything reaches it.
const EXPECTED_EFFECTS: Record<Effect["kind"], true> = {
  Diag: true,
  LogDecision: true,
  PageOncall: true,
  DeliverArtifact: true,
  PublishConclusion: true,
};

describe("C13 — handler totality", () => {
  const declared = Object.keys(EXPECTED_EFFECTS);
  const rig = (): { log: string[]; ports: Ports } => {
    const log: string[] = [];
    return { log, ports: offlinePorts((line) => log.push(line)) };
  };

  it("ALLOWS the shipped dispatcher — every declared kind has a handler", () => {
    expect(handlerGaps(declared, effectHandlers(rig().ports))).toEqual([]);
  });

  it("DENIES a dispatcher with one handler pulled out", () => {
    const thinned: Record<string, unknown> = { ...effectHandlers(rig().ports) };
    delete thinned.PageOncall;
    expect(handlerGaps(declared, thinned)).toEqual([
      '"PageOncall" is a declared Effect kind with no registered handler',
    ]);
  });

  it("DENIES a handler registered under a kind the union does not declare", () => {
    const strayed: Record<string, unknown> = {
      ...effectHandlers(rig().ports),
      SendCarrierPigeon: () => undefined,
    };
    expect(handlerGaps(declared, strayed)).toEqual([
      '"SendCarrierPigeon" has a registered handler but is not a declared Effect kind',
    ]);
  });

  it("the missing handler is DIAGNOSED at the real sink — never silent, never a crash", () => {
    const { log, ports } = rig();
    const thinned: Record<string, unknown> = { ...effectHandlers(ports) };
    delete thinned.PageOncall;
    // the real construction path: the same factory `effectSink` uses.
    const sink = handlerSink(thinned as unknown as Handlers<Effect>, (effect) =>
      ports.log(`[diag @${effect.at}] ${effect.note}`),
    );

    const orphan: PageOncall = {
      kind: "PageOncall",
      at: 7 as Timestamp,
      effectClass: "Irreversible",
      ticket: "4118",
    };
    sink.perform(keyedEffect(0, 0, orphan), "LIVE");

    expect(log).toEqual([`[diag @7] ${ORPHAN_EFFECT} \`PageOncall\``]);
    // the on-call port was NOT reached, and nothing threw
    expect(log.some((line) => line.includes("pager"))).toBe(false);
  });

  it("REPLAY still touches nothing, dispatcher or not (G9)", () => {
    const { log, ports } = rig();
    const sink = effectSink(ports);
    sink.perform(
      keyedEffect(0, 0, {
        kind: "PageOncall",
        at: 7 as Timestamp,
        effectClass: "Irreversible",
        ticket: "4118",
      } satisfies PageOncall),
      "REPLAY",
    );
    expect(log).toEqual([]);
  });

  // ── TIER INDEPENDENCE, the reason handlers sit BESIDE the verb registry ───
  // Handlers are assembled by `effectHandlers(ports)`, not carried on
  // `BlockRegistration`. That fork was chosen because handler totality must hold
  // whatever tier is wired: a two-of-six DEEP_TIER app registers two blocks'
  // VERBS and still performs every effect kind in the system. On
  // `BlockRegistration` the same app would ship a partial handler set and the
  // totality rule would be unstateable. This is the assertion that keeps the
  // reason true instead of merely argued — and it proves the tier really is
  // reduced, so a wiring that silently ignored `verbs` could not satisfy it.
  it("a DEEP_TIER wiring still ships a TOTAL handler set", () => {
    const { ports } = rig();
    const clock = movingClock(1000 as Timestamp, 7 as Timestamp);
    const deep = wireApp({ clock, sink: effectSink(ports), verbs: DEEP_TIER });
    const whole = wireApp({ clock, sink: effectSink(ports), verbs: ALL_BLOCKS });

    expect(deep.registry.size).toBeLessThan(whole.registry.size);
    expect(handlerGaps(declared, effectHandlers(ports))).toEqual([]);
  });
});
