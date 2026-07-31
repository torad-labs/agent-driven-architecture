// ── ADMISSION — the refusal is a property of the DERIVATION, not of LIVE ──
//
// docs/DECISIONS.md:85 says the boundary refuses an irreversible effect before
// perform. Written ONLY at the boundary that is a property of the LIVE path, and
// a recovery re-drive derives its own effect sequence from the committed
// results — so a rule the live path applies and the re-derivation does not is a
// rule that pages on-call again on restart. Every probe below drives a session
// in which the refusal actually fires, then asserts that the LIVE sink,
// `refold`, `collectPerform` in RECOVERY and `refoldFrom` all agree.
//
// THE PROBE HAS TO BE BUILT, and that is a MEASUREMENT of the shipped reference
// rather than a weakness of the rule. Only two verbs are registered
// `Irreversible` (`confirmEscalation`, `confirmSeal`) and the only two
// `Irreversible`-class effects (`PageOncall`, `DeliverArtifact`) are emitted
// exclusively from their own arms — check C17 now denies any other construction
// site outright — so admission refuses NOTHING on the shipped app: it is a
// floor, and a floor nobody stands on is invisible. The rig below therefore
// installs a fold that DOES the wrong thing, because a probe whose session never
// produces a refused effect passes every arrangement of the code and proves
// nothing at all.
//
// TWO ROGUE ATTRIBUTIONS, for the two clauses of the rule:
//   · a page attributed to an OK `setPriority`      — a Reversible verb has no
//     licence, and its neighbour's licence is not transferable (PER EFFECT);
//   · a page attributed to a GATE-REFUSED `confirmEscalation` — the verb IS
//     Irreversible and the result did NOT survive (the `ok` clause), which is
//     the headline failure of docs/DECISIONS.md:85 and the one clause no other
//     probe can see.

import { describe, expect, it } from "vitest";
import { dispatchers } from "../../src/app/assemble";
import type { State } from "../../src/app/contract";
import { initialState } from "../../src/app/contract";
import { ALL_BLOCKS, effectSink } from "../../src/app/wire";
import type { PageOncall } from "../../src/blocks/escalation/contract";
import type { FinishedStep } from "../../src/spine/boundary/action";
import { registryOf } from "../../src/spine/boundary/action";
import { Boundary } from "../../src/spine/boundary/boundary";
import {
  DedupingSink,
  InMemoryBus,
  movingClock,
  RecordingSink,
  sequentialIds,
} from "../../src/spine/boundary/in-memory";
import type { Licences } from "../../src/spine/pure/effect";
import { attributed, licencesOf, REFUSED_EFFECT } from "../../src/spine/pure/effect";
import type { Timestamp } from "../../src/spine/pure/ids";
import type { ToolResultBase } from "../../src/spine/pure/tool-result";
import type { Dispatchers } from "../../src/spine/pure/verb";
import {
  collectPerform,
  refold,
  refoldFrom,
  snapshotAt,
  timelineTail,
} from "../../src/spine/replay/replay";
import { fakeWorld, POLICY_TIER, switchableAuthz } from "../harness";
import { must } from "../support/must";

/** The ticket the rogue arm pages about — deliberately NOT the one any confirm
 *  in the session names, so "an unrelated ticket" is checkable rather than
 *  rhetorical. */
const UNRELATED = "9999";

const page = (at: Timestamp, ticket: string): PageOncall => ({
  kind: "PageOncall",
  at,
  effectClass: "Irreversible",
  ticket,
});

/**
 * A fold that emits an `Irreversible`-class effect off results that did not earn
 * one. Both wrong shapes, in one rig, keyed on different results so a probe can
 * drive either in isolation.
 */
function rogueFold(base: Dispatchers<State>): Dispatchers<State> {
  return {
    fold(state, results, now, sig) {
      const out = base.fold(state, results, now, sig);
      const extra = [];
      // (1) an OK result of a REVERSIBLE verb — no licence at all
      const carrier = results.find((r) => r.tool === "setPriority" && r.outcome === "ok");
      if (carrier !== undefined) extra.push(attributed(carrier, page(now, UNRELATED)));
      // (2) a GATE-REFUSED result of an IRREVERSIBLE verb — the licence exists,
      //     the result did not survive. This is the `ok` clause's only witness.
      const denied = results.find((r) => r.tool === "confirmEscalation" && r.outcome === "refused");
      if (denied !== undefined) {
        extra.push(attributed(denied, page(now, (denied as { ticket?: string }).ticket ?? "?")));
      }
      return { state: out.state, effects: [...out.effects, ...extra] };
    },
    projectContext: base.projectContext,
  };
}

interface Rig {
  readonly boundary: Boundary<State>;
  readonly bus: InMemoryBus;
  readonly sink: RecordingSink;
  readonly world: ReturnType<typeof fakeWorld>["world"];
  readonly rogue: Dispatchers<State>;
  readonly licences: Licences;
  readonly initial: State;
  readonly actAs: ReturnType<typeof switchableAuthz>["actAs"];
  readonly step: (...actions: FinishedStep["actions"]) => void;
}

function rig(): Rig {
  const { world, ports } = fakeWorld();
  const sink = new RecordingSink(effectSink(ports));
  const { authz, actAs } = switchableAuthz();
  const registry = registryOf<State>(ALL_BLOCKS.flatMap((r) => r.verbs));
  const bus = new InMemoryBus();
  const initial = initialState({ tickets: [{ id: "4118", body: "refund not received" }] });
  const rogue = rogueFold(dispatchers);
  const boundary = new Boundary<State>(
    {
      clock: movingClock(1000 as Timestamp, 7 as Timestamp),
      ids: sequentialIds("cmd"),
      bus,
      sink,
      authz,
      registry,
      session: "session-1",
      promptVersion: "prompt-v1",
      fold: rogue.fold,
      projectContext: rogue.projectContext,
    },
    initial,
  );
  return {
    boundary,
    bus,
    sink,
    world,
    rogue,
    licences: licencesOf(registry.values()),
    initial,
    actAs,
    step: (...actions) => void boundary.onStepFinish({ by: "Agent", staged: [], actions }),
  };
}

const setPriority = { tool: "setPriority", input: { ticket: "4118", level: "High" } };
const requestEscalation = { tool: "requestEscalation", input: { ticket: "4118" } };
const confirmEscalation = { tool: "confirmEscalation", input: { ticket: "4118" } };

const kinds = (keyed: readonly { readonly effect: { readonly kind: string } }[]): string[] =>
  keyed.map((k) => k.effect.kind);

const outcomes = (r: ToolResultBase): string => `${r.tool}:${r.outcome}`;

describe("admission — the boundary refuses before perform (docs/DECISIONS.md:85)", () => {
  it("REFUSES an irreversible effect no irreversible verb earned, and SUBSTITUTES at its own key", () => {
    const r = rig();
    r.step(setPriority);

    // substitute, never drop: the list length is what the fold produced, so the
    // (step, index) key derivation is untouched (G9).
    expect(kinds(r.sink.performed)).toEqual(["LogDecision", "Diag"]);
    expect(r.sink.performed.map((k) => k.key)).toEqual([
      { step: 0, index: 0 },
      { step: 0, index: 1 },
    ]);
    expect(JSON.stringify(must(r.sink.performed[1]).effect)).toContain(REFUSED_EFFECT);
    // and the world was NOT paged
    expect(r.world.pages).toEqual([]);
  });

  it("the licence is PER EFFECT — a surviving Irreversible verb licenses nothing else in its step", () => {
    const r = rig();
    r.step(requestEscalation);
    r.actAs("Agent", POLICY_TIER);
    // ONE step, TWO results: an Irreversible verb that survives the gate, and a
    // Reversible one whose arm emits an irreversible effect for another ticket.
    r.step(confirmEscalation, setPriority);

    expect(kinds(r.sink.performed)).toEqual(["PageOncall", "LogDecision", "Diag"]);
    expect(r.world.pages).toEqual(["4118"]);
    expect(r.world.pages).not.toContain(UNRELATED);
  });

  it("A GATE-REFUSED IRREVERSIBLE VERB EARNS NOTHING — the `ok` clause's own probe", () => {
    // The verb IS `confirmEscalation`, which the registry classifies
    // Irreversible, so the licence set contains its name. What it does NOT have
    // is a surviving result: requesting and confirming as the SAME authority is
    // a self-confirm, and the gate commits `Refused` (spine/boundary/gate.ts).
    // An arm that emitted a page off the back of that verdict would be
    // performing exactly what the gate denied — so `admit` checks the OUTCOME as
    // well as the name, and this is the only probe that can see it.
    const r = rig();
    r.step(requestEscalation);
    r.step(confirmEscalation); // no actAs — still AGENT_RUN, so: self-confirm

    const committed = r.bus.records().flatMap((rec) => rec.results.map(outcomes));
    expect(committed).toContain("confirmEscalation:refused");

    expect(kinds(r.sink.performed)).toEqual(["Diag", "Diag"]);
    expect(kinds(r.sink.performed)).not.toContain("PageOncall");
    expect(JSON.stringify(must(r.sink.performed[1]).effect)).toContain(REFUSED_EFFECT);
    expect(r.world.pages).toEqual([]);

    // …and the re-derivation agrees, key for key.
    const replayed = refold(r.initial, r.bus.records(), r.rogue, r.licences);
    expect(replayed.effects).toEqual(r.sink.performed);

    const recovery = fakeWorld();
    const sink = new DedupingSink(effectSink(recovery.ports));
    collectPerform(r.initial, r.bus.records(), r.rogue, r.licences, sink, "RECOVERY");
    expect(recovery.world.pages).toEqual([]);
  });
});

describe("admission — live == REPLAY == RECOVERY by construction", () => {
  it("`refold` re-derives the refusal, key for key", () => {
    const r = rig();
    r.step(setPriority);

    const replayed = refold(r.initial, r.bus.records(), r.rogue, r.licences);
    expect(replayed.effects).toEqual(r.sink.performed);
    expect(replayed.state).toEqual(r.boundary.state);
  });

  it("RECOVERY re-drives the timeline and does NOT page what the boundary refused", () => {
    // THE PINNED ACCEPTANCE. Against a draft that admitted only at the boundary,
    // this probe paged `9999` on the recovery path while every other test in the
    // suite stayed green.
    const r = rig();
    r.step(setPriority);
    expect(r.world.pages).toEqual([]);

    const recovery = fakeWorld();
    const sink = new DedupingSink(effectSink(recovery.ports));
    collectPerform(r.initial, r.bus.records(), r.rogue, r.licences, sink, "RECOVERY");
    collectPerform(r.initial, r.bus.records(), r.rogue, r.licences, sink, "RECOVERY");

    expect(sink.fired).toEqual(r.sink.performed);
    expect(recovery.world.pages).toEqual([]);
  });

  it("a SNAPSHOT RESUME re-derives it too — `refoldFrom` folds its own loop", () => {
    // `refoldFrom` does not call `refold`; it re-implements the loop over a tail.
    // Deleting `admit` from THAT loop alone leaves every probe above green.
    const r = rig();
    r.step(setPriority);
    r.step(setPriority);

    const records = r.bus.records();
    const snapshot = snapshotAt(r.initial, records, r.rogue, r.licences, 1, "fold-v1");
    const resumed = refoldFrom(snapshot, timelineTail(records, 1), r.rogue, r.licences, "fold-v1");

    expect(resumed.kind).toBe("Resumed");
    if (resumed.kind !== "Resumed") return;
    expect(resumed.refolded.effects).toEqual(r.sink.performed);
    expect(kinds(resumed.refolded.effects)).toEqual(["LogDecision", "Diag", "LogDecision", "Diag"]);
  });
});

describe("admission — the compliant shape is untouched", () => {
  it("an Irreversible effect from its OWN Irreversible verb is performed, live and on replay", () => {
    const r = rig();
    r.step(requestEscalation);
    r.actAs("Agent", POLICY_TIER);
    r.step(confirmEscalation);

    expect(kinds(r.sink.performed)).toEqual(["PageOncall"]);
    expect(r.world.pages).toEqual(["4118"]);
    expect(refold(r.initial, r.bus.records(), r.rogue, r.licences).effects).toEqual(
      r.sink.performed,
    );
  });

  it("a Routine effect from a Reversible verb needs no licence at all", () => {
    const r = rig();
    r.step({ tool: "recordFinding", input: { text: "first" } });
    // no effect at all from this arm, and nothing refused
    expect(kinds(r.sink.performed)).toEqual([]);
  });
});
