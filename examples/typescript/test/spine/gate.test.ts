// ── G1 / G6 — the pre-fold gate, keyed on AUTHORITY ────────────────────────
//
// G1, MEASURED against the shipped reference:
//   onStepFinish({actor:"Agent", results:[{kind:"EscalationConfirmed", ticket:"4118", by:"Human"}]})
//     → performed [{"kind":"PageOncall","ticket":"4118","at":9}]
//       committed [{"kind":"ConfirmEscalation","by":"Agent","id":"c1",…}]
//       status Escalated
//
// A tool copied an Actor into its own payload, the fold branched on THAT, and
// the boundary stamped a different one a line later. An Actor is now
// unrepresentable upstream of the boundary, so the forged path does not exist.

import { describe, expect, it } from "vitest";
import type { State, ToolResult } from "../../src/app/contract";
import { initialState } from "../../src/app/contract";
import { effectSink, wireApp } from "../../src/app/wire";
import { escalation } from "../../src/blocks/escalation/register";
import { fixedClock, RecordingSink } from "../../src/spine/boundary/in-memory";
import type { Ctx } from "../../src/spine/pure/verb";
import { AGENT_RUN, fakeWorld, HOST, harness, POLICY_TIER, SPINE } from "../harness";
import { must } from "../support/must";

function request(h: ReturnType<typeof harness>): void {
  h.app.boundary.onStepFinish({
    by: "Agent",
    staged: [],
    actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
  });
}

function confirm(h: ReturnType<typeof harness>, by: "Agent" | "Human"): void {
  h.app.boundary.onStepFinish({
    by,
    staged: [],
    actions: [{ tool: "confirmEscalation", input: { ticket: "4118" } }],
  });
}

// ── G1 — an Actor is UNREPRESENTABLE upstream of the boundary ──────────────
// The fix for two unreconciled actor values is not a rule against writing the
// second one; it is that there is nowhere to write it. The two declarations
// below stop compiling the moment any ToolResult variant gains an actor-ish
// member, or `Ctx` gains a field beyond the two it is allowed. `npm run
// typecheck` runs before `vitest` in `npm test`, so these are blocking.
type Actorish = "by" | "actor" | "authority" | "sig" | "signature";
type Offending<T> = T extends unknown
  ? [Extract<keyof T, Actorish>] extends [never]
    ? never
    : T
  : never;

const NO_ACTOR_ON_ANY_TOOL_RESULT: [Offending<ToolResult>] extends [never] ? true : never = true;
const CTX_IS_STATE_AND_CONTEXT_ONLY: [Exclude<keyof Ctx<State>, "state" | "context">] extends [
  never,
]
  ? true
  : never = true;

describe("G1 — an Actor cannot ride upstream of the boundary", () => {
  it("no ToolResult variant has an actor-typed member, and `Ctx` has no actor at all", () => {
    // a type-level assertion needs a runtime witness so the suite reports it
    expect(NO_ACTOR_ON_ANY_TOOL_RESULT).toBe(true);
    expect(CTX_IS_STATE_AND_CONTEXT_ONLY).toBe(true);
  });

  it("an Actor smuggled through a tool's RAW INPUT never reaches the gate", () => {
    const h = harness();
    request(h); // Escalating(requestedBy = agent-run-7f)

    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      // the shipped reference's exact shape: an actor value riding the payload,
      // claiming to be the human the fold used to branch on
      actions: [{ tool: "confirmEscalation", input: { ticket: "4118", by: "Human" } }],
    });

    const record = must(h.app.bus.records().at(-1));
    // what was ASKED is kept verbatim — that is the audit half G1 named …
    expect(record.actions.at(-1)).toEqual({
      tool: "confirmEscalation",
      input: { ticket: "4118", by: "Human" },
    });
    // … and what was FOLDED carries no actor field of any kind. The decoder
    // dropped `by` before the tool body ran, and the gate compared the
    // Signature the boundary minted afterwards.
    expect(record.results.at(-1)).toEqual({
      outcome: "refused",
      tool: "confirmEscalation",
      reason: "self-confirm: the confirming authority is the requesting authority",
    });
    expect(must(record.commands.at(-1)).sig).toEqual({ by: "Agent", authority: AGENT_RUN });
    // OLD (measured): performed [{"kind":"PageOncall","ticket":"4118","at":9}], status Escalated
    expect(h.world.pages).toEqual([]);
    expect(h.sink.performed.some((k) => k.effect.kind === "PageOncall")).toBe(false);
    expect(must(escalation.statusOf(h.app.boundary.state.escalation, "4118")).kind).toBe(
      "Escalating",
    );
  });
});

describe("the irreversible gate (G1/G6) — at the boundary, before the fold", () => {
  it("an agent confirming its OWN request is refused: same authority, no page", () => {
    const h = harness();
    request(h);
    confirm(h, "Agent");

    const record = must(h.app.bus.records().at(-1));
    expect(record.results.at(-1)).toEqual({
      outcome: "refused",
      tool: "confirmEscalation",
      reason: "self-confirm: the confirming authority is the requesting authority",
    });
    // the Actor is still stamped TRUTHFULLY on the committed command
    expect(must(record.commands.at(-1)).sig.by).toBe("Agent");
    expect(h.sink.performed.some((k) => k.effect.kind === "PageOncall")).toBe(false);
    expect(h.world.pages).toEqual([]);
    // the status is unchanged — still awaiting a different authority
    expect(must(escalation.statusOf(h.app.boundary.state.escalation, "4118")).kind).toBe(
      "Escalating",
    );
  });

  it("a confirm with NO prior request is refused before the fold — status stays Open", () => {
    const h = harness();
    confirm(h, "Human");

    expect(must(h.app.bus.records().at(-1)).results.at(-1)).toEqual({
      outcome: "refused",
      tool: "confirmEscalation",
      reason: "no pending request",
    });
    expect(h.world.pages).toEqual([]);
    expect(must(escalation.statusOf(h.app.boundary.state.escalation, "4118")).kind).toBe("Open");
    // 12.4: the failure lands as exactly ONE per-item marker beside the item …
    expect(h.app.boundary.state.spine.notices).toEqual([
      { kind: "Refused", at: 1000, tool: "confirmEscalation", reason: "no pending request" },
    ]);
    // … and NEVER on the session-global status. OLD (measured): the banner read
    // "degraded: …" for the rest of the session and no arm ever cleared it.
    expect(h.app.boundary.state.spine.run.kind).toBe("Idle");
    expect(h.app.controller.view.banner).toBe("ok");

    // and the session is not poisoned: the next good item folds normally
    h.app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "setPriority", input: { ticket: "4118", level: "Urgent" } }],
    });
    expect(h.app.boundary.state.triage.priority.get("4118")).toBe("Urgent");
    expect(h.app.boundary.state.spine.run.kind).toBe("Idle");
    expect(h.app.controller.view.banner).toBe("ok");
  });

  it("an UNATTENDED confirmer promotes: Actor.Agent, a different Authority (G6)", () => {
    const h = harness();
    request(h);
    expect(escalation.statusOf(h.app.boundary.state.escalation, "4118")).toMatchObject({
      kind: "Escalating",
      requestedBy: AGENT_RUN,
    });

    // the same stream, now acting under a policy tier's permission
    h.actAs("Agent", POLICY_TIER);
    confirm(h, "Agent");

    expect(h.world.pages).toEqual(["4118"]);
    expect(must(must(h.app.bus.records().at(-1)).commands.at(-1)).sig).toEqual({
      by: "Agent", // truthful: it acted through the agent's stream
      authority: POLICY_TIER, // the field that differs
    });
    expect(escalation.statusOf(h.app.boundary.state.escalation, "4118")).toMatchObject({
      kind: "Escalated",
      confirmedBy: POLICY_TIER,
    });
  });

  it("a human host confirms too — same mechanism, a different principal", () => {
    const h = harness();
    request(h);
    confirm(h, "Human");

    expect(h.world.pages).toEqual(["4118"]);
    expect(must(must(h.app.bus.records().at(-1)).commands.at(-1)).sig).toEqual({
      by: "Human",
      authority: HOST,
    });
  });

  it("a confirm on a ticket this stream never heard of is refused, and fires nothing", () => {
    const h = harness();
    h.app.boundary.onStepFinish({
      by: "Human",
      staged: [],
      actions: [{ tool: "confirmEscalation", input: { ticket: "9999" } }],
    });

    // NOTE: the gate is strictly EARLIER than the arm for an irreversible verb,
    // so an unknown ticket lands as Refused (boundary) rather than Rejected
    // (arm). The arm rejects it too — see test/blocks/escalation.test.ts — but
    // control never reaches it. What the review measured (12.4) (a page fired, and the session
    // went Degraded) cannot happen either way.
    expect(must(h.app.bus.records().at(-1)).results.at(-1)).toMatchObject({
      outcome: "refused",
      tool: "confirmEscalation",
    });
    // OLD (measured): PageOncall("nope") FIRED, and run → Degraded.
    expect(h.world.pages).toEqual([]);
    expect(h.sink.performed.some((k) => k.effect.kind === "PageOncall")).toBe(false);
    expect(h.app.boundary.state.spine.notices).toEqual([
      { kind: "Refused", at: 1000, tool: "confirmEscalation", reason: "no pending request" },
    ]);
    expect(h.app.boundary.state.spine.run.kind).toBe("Idle");
    expect(h.app.controller.view.banner).toBe("ok");
  });

  it("the product's own ConfirmPolicy can refuse even a different principal", () => {
    const { world, ports } = fakeWorld();
    const sink = new RecordingSink(effectSink(ports));
    const app = wireApp({
      clock: fixedClock(9),
      sink,
      initial: initialState({ tickets: [{ id: "4118", body: "x" }] }),
      // the seam 14.3 routes actor-keyed checks to: a product rule, applied
      // after the gate's structural checks have already passed
      authz: {
        // TOTAL BY CONSTRUCTION, not by an `else`. The ternary silently absorbed
        // every non-Human Actor into AGENT_RUN, so `Spine` arrived here wearing
        // the run's principal and nothing said so. An object literal makes a
        // missing Actor a COMPILE error (TS2339/TS2322) instead.
        authorityOf: (by) => ({ Human: HOST, Agent: AGENT_RUN, Spine: SPINE })[by],
        mayConfirm: () => false,
      },
    });

    app.boundary.onStepFinish({
      by: "Agent",
      staged: [],
      actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
    });
    app.boundary.onStepFinish({
      by: "Human",
      staged: [],
      actions: [{ tool: "confirmEscalation", input: { ticket: "4118" } }],
    });

    expect(must(app.bus.records().at(-1)).results.at(-1)).toEqual({
      outcome: "refused",
      tool: "confirmEscalation",
      reason: "authority may not confirm this action",
    });
    expect(world.pages).toEqual([]);

    // WITNESS for the resolver's TOTALITY, not just its current shape. A future
    // "simplify this back" to a Human/other ternary silently hands Spine the
    // run's principal; this assertion is what goes red when that happens.
    app.boundary.onStepFinish({
      by: "Spine",
      staged: [],
      actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
    });
    expect(must(app.bus.records().at(-1)).commands[0]).toMatchObject({
      sig: { by: "Spine", authority: SPINE },
    });
  });

  it("a second confirm cannot re-page: no pending request survives the first", () => {
    const h = harness();
    request(h);
    confirm(h, "Human");
    confirm(h, "Human");

    expect(h.world.pages).toEqual(["4118"]);
    expect(must(h.app.bus.records().at(-1)).results.at(-1)).toMatchObject({
      outcome: "refused",
      reason: "no pending request",
    });
  });
});
