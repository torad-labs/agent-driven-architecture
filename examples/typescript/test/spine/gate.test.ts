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
import type { Action, FinishedStep, StepChannel } from "../../src/spine/boundary/action";
import { fixedClock, RecordingSink } from "../../src/spine/boundary/in-memory";
import type { Actor } from "../../src/spine/pure/actor";
import type { StagedInput } from "../../src/spine/pure/staged";
import type { Ctx } from "../../src/spine/pure/verb";
import { AGENT_RUN, fakeWorld, HOST, harness, POLICY_TIER, SPINE } from "../harness";
import { must } from "../support/must";

function request(h: ReturnType<typeof harness>): void {
  h.app.boundary.agent.submit({
    staged: [],
    actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
  });
}

/** THE CHANNEL IS THE ARGUMENT NOW, not the Actor — because a channel is what a
 *  caller actually holds. The old signature took `"Agent" | "Human"` and wrote it
 *  into the payload, which is the forge in miniature: one helper, two principals,
 *  chosen by a string. */
function confirm(channel: StepChannel): void {
  channel.submit({
    staged: [],
    actions: [{ tool: "confirmEscalation", input: { ticket: "4118" } }],
  });
}

// ── G1 — an Actor is UNREPRESENTABLE upstream of the boundary ──────────────
// The fix for two unreconciled actor values is not a rule against writing the
// second one; it is that there is nowhere to write it. The six declarations
// below stop compiling the moment any ToolResult variant gains an actor-ish
// member, `Ctx` gains a field beyond the two it is allowed, or the step payload
// grows a way to say who acted. `npm run typecheck` runs before `vitest` in
// `npm test`, so these are blocking.
//
// THE FOUR STEP DECLARATIONS ARE THE ENFORCEMENT LAYER FOR §5.3, and it is a
// COMPILE layer rather than a lint on purpose. `Actor` is a string-literal union
// in this port, so `by: "Spine"` needed no import and no identifier: a name-keyed
// rule saw nothing, and so did a literal-keyed one once the value was hoisted
// into a `const` or asserted through `as Actor`.
//
// DELETING THE FIELD IS NOT WHAT DENIES THE FORM — that was measured, and it is
// worth writing down because it is the mistake this file made first. A payload
// with no `by` still accepts `readonly onBehalfOf?: Actor`, every existing call
// site still compiles because the member is optional, and a boundary that reads
// it restores the forge whole with the suite green. `Offending` cannot see that:
// it keys on five NAMES. The three declarations after it key on the member TYPE,
// on the member SET, and on the whole SHAPE. Each is load-bearing, and none of
// that is reasoned — it is measured. (2) and (3) each caught a forge that
// reached `world.deliveries` past the other one. (1) fires nowhere (2) or (3)
// does not on the seventeen shapes this was tried against, but it is the pin
// that survives a WEAKENED sibling: widen (2)'s allowlist to admit the new
// member and (1) is the only thing left standing, which is exactly the diff a
// tired reviewer waves through. It is also the only one that names the
// INVARIANT rather than a structural proxy for it.
type Actorish = "by" | "actor" | "authority" | "sig" | "signature";
type Offending<T> = T extends unknown
  ? [Extract<keyof T, Actorish>] extends [never]
    ? never
    : T
  : never;

const NO_ACTOR_ON_ANY_TOOL_RESULT: [Offending<ToolResult>] extends [never] ? true : never = true;
const NO_ACTOR_ON_A_FINISHED_STEP: [Offending<FinishedStep>] extends [never] ? true : never = true;

// (1) DENIES THE FORM, NOT THE NAME. `Offending` keys on five spellings; a
// sixth (`onBehalfOf`, `principal`, anything) walks straight past it. This keys
// on the TYPE — any member an `Actor` value could inhabit, whatever it is
// called — so a rename buys nothing and neither does a `type` alias.
//
// THREE PIECES ARE LOAD-BEARING, each because the same rule without it was
// MEASURED going clean on a shape it must deny, while staying clean on the
// correct one — so none of the three can be simplified away:
//  · `NonNullable`, because `-?` strips optionality from the mapped OUTPUT and
//    not from the `T[K]` lookup — without it `readonly onBehalfOf?: "Spine"` is
//    `"Spine" | undefined` and slips past in BOTH directions;
//  · BOTH arms of `Inhabited`, because `Actor extends X` catches `Actor`,
//    `string` and `unknown` while `X extends Actor` catches a narrowed literal.
//    The one-arm form misses `?: "Spine"`; the intersection form
//    `[Actor & T[K]] extends [never]` false-positives on the CORRECT shape;
//  · the DISTRIBUTION, `X extends unknown ? … : never`, because
//    `readonly StagedInput[] | "Spine"` satisfies neither direction taken whole
//    while one of its members is an actor value outright. The non-distributive
//    form reads `never` from it; this one names the member.
type Inhabited<X> = X extends unknown ? (Actor extends X ? X : X extends Actor ? X : never) : never;
type ActorBearing<T> = {
  [K in keyof T]-?: [Inhabited<NonNullable<T[K]>>] extends [never] ? never : K;
}[keyof T];
const NO_ACTOR_TYPED_MEMBER_ON_A_STEP: [ActorBearing<FinishedStep>] extends [never] ? true : never =
  true;

// (2) A MEMBER AT ALL. `ActorBearing` denies a member that IS an actor; it is
// blind to one that merely CONTAINS one — `meta: { by: Actor }`,
// `by: readonly Actor[]` and `by: () => Actor` all read `never` from it, and a
// boundary reading `step.meta.by` forges exactly as well. Recursion cannot close
// those: `Action.input` is `RawInput = unknown` and `Perceived.body` is
// `string`, so a rule that descends one level fires on the CORRECT shape
// (measured, both). Allowing a fixed member SET closes them instead — a carrier
// still needs a member to hide in, and there is none to spare. Same idiom as
// `CTX_IS_STATE_AND_CONTEXT_ONLY` below, same deliberate brittleness: growing
// this payload is a diff a reviewer is made to look at.
const A_STEP_IS_STAGED_AND_ACTIONS_ONLY: [
  Exclude<keyof FinishedStep, "staged" | "actions">,
] extends [never]
  ? true
  : never = true;

// (3) AND THE SHAPE OF THE TWO IT KEEPS — because (1) and (2) together are
// still not enough, and that was MEASURED, not reasoned. Retyping an EXISTING
// member adds no key for (2) to see, and an actor hidden in a union or an
// intersection under it is not the member's own type for (1) to see:
//
//     readonly staged: readonly (StagedInput | Actor)[]
//
// with `commit` picking the string out of `staged` restored the forge whole —
// `world.deliveries.length` back to 1 on all three orderings, `tsc` clean and
// the entire suite green. `StepShape` is the port's declaration written down a
// second time, and mutual assignability makes the two an equality: `staged` and
// `actions` may be exactly what `spine/pure` says they are and nothing wider.
//
// WHAT IS LEFT, named rather than implied: `Perceived` or `Action` ITSELF
// growing a stamp is invisible to all four, because both sides of the equality
// name the same type. That is the declaration rule's territory, and it already
// has an owner — C4_SHAPE in eslint.config.js denies `Actor|Authority|Signature`
// inside `StagedInputBase | Perceived | Recalled`. Extending that owner is the
// move if it ever needs one; duplicating it here is not.
interface StepShape {
  readonly staged: readonly StagedInput[];
  readonly actions: readonly Action[];
}
const A_STEP_IS_EXACTLY_THE_SHAPE_THE_PORT_DECLARES: FinishedStep extends StepShape
  ? StepShape extends FinishedStep
    ? true
    : never
  : never = true;
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

  it("and neither does the STEP PAYLOAD — the Actor is a property of the channel", () => {
    // Four type-level assertions, four different evasions, and only the three
    // after the first are form-keyed — which is what makes §5.3's invariant a
    // compiler fact rather than a convention. Proven red-green against SYNTHETIC
    // violations, one mutation each: `readonly by: Actor` (name); `readonly
    // onBehalfOf?: Actor`, `?: "Spine"`, `?: string`, `?: unknown` and a
    // `typealias` (type); `meta: { by: Actor }`, `by: readonly Actor[]` and
    // `by: () => Actor` (member set); and retyping an existing member to
    // `readonly (StagedInput | Actor)[]` or `readonly (StagedInput & { by:
    // Actor })[]` (shape). Every one is a payload the boundary could read a
    // principal out of, two of them were measured DELIVERING under a green
    // suite, and every one now fails `tsc`.
    expect(NO_ACTOR_ON_A_FINISHED_STEP).toBe(true);
    expect(NO_ACTOR_TYPED_MEMBER_ON_A_STEP).toBe(true);
    expect(A_STEP_IS_STAGED_AND_ACTIONS_ONLY).toBe(true);
    expect(A_STEP_IS_EXACTLY_THE_SHAPE_THE_PORT_DECLARES).toBe(true);
  });

  it("an Actor smuggled through a tool's RAW INPUT never reaches the gate", () => {
    const h = harness();
    request(h); // Escalating(requestedBy = agent-run-7f)

    h.app.boundary.agent.submit({
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
    confirm(h.app.boundary.agent);

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
    confirm(h.app.boundary.human);

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
    h.app.boundary.agent.submit({
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
    confirm(h.app.boundary.agent);

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
    confirm(h.app.boundary.human);

    expect(h.world.pages).toEqual(["4118"]);
    expect(must(must(h.app.bus.records().at(-1)).commands.at(-1)).sig).toEqual({
      by: "Human",
      authority: HOST,
    });
  });

  it("a confirm on a ticket this stream never heard of is refused, and fires nothing", () => {
    const h = harness();
    h.app.boundary.human.submit({
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

    app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
    });
    app.boundary.human.submit({
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
    app.boundary.spine.submit({
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
    confirm(h.app.boundary.human);
    confirm(h.app.boundary.human);

    expect(h.world.pages).toEqual(["4118"]);
    expect(must(h.app.bus.records().at(-1)).results.at(-1)).toMatchObject({
      outcome: "refused",
      reason: "no pending request",
    });
  });
});
