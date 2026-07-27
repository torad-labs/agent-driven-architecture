// ── blocks/escalation in ISOLATION ─────────────────────────────────────────
// The arm never decides WHO may confirm — the boundary already did, and
// committed its verdict. What the arm does is validate the transition against
// its own slice and emit the irreversible effect only on success.

import { describe, expect, it } from "vitest";
import { escalation } from "../../src/blocks/escalation/register";
import { authority, Signature } from "../../src/spine/pure/actor";

const agent = new Signature("Agent", authority("agent-run-7f"));
const tier = new Signature("Agent", authority("policy-tier-v3"));
const slice = escalation.sliceOf(["4118"]);

describe("blocks/escalation — the arm (F9)", () => {
  it("a request is REVERSIBLE: state moves, nothing pages", () => {
    const out = escalation.arm(
      slice,
      { outcome: "ok", tool: "requestEscalation", ticket: "4118" },
      5,
      agent,
    );

    expect(out.slice.statuses.get("4118")).toEqual({
      kind: "Escalating",
      ticket: "4118",
      requestedBy: "agent-run-7f",
    });
    expect(out.effects).toEqual([]);
  });

  it("a confirm pages ONLY from the success branch", () => {
    const escalating = escalation.arm(
      slice,
      { outcome: "ok", tool: "requestEscalation", ticket: "4118" },
      5,
      agent,
    ).slice;
    const out = escalation.arm(
      escalating,
      { outcome: "ok", tool: "confirmEscalation", ticket: "4118" },
      9,
      tier,
    );

    expect(out.effects).toEqual([{ kind: "PageOncall", at: 9, ticket: "4118" }]);
    expect(out.slice.statuses.get("4118")).toEqual({
      kind: "Escalated",
      ticket: "4118",
      requestedBy: null,
      confirmedBy: "policy-tier-v3",
    });
  });

  it("a ticket this stream has never heard of is REJECTED, and nothing fires", () => {
    const out = escalation.arm(
      slice,
      { outcome: "ok", tool: "requestEscalation", ticket: "9999" },
      5,
      agent,
    );

    expect(out.effects).toEqual([]);
    expect(out.notices).toEqual([
      { kind: "Rejected", at: 5, tool: "requestEscalation", reason: "unknown ticket 9999" },
    ]);
    expect(out.slice).toBe(slice);
  });

  it("a confirm with no pending request is REJECTED by the arm too — defence in depth", () => {
    const out = escalation.arm(
      slice,
      { outcome: "ok", tool: "confirmEscalation", ticket: "4118" },
      5,
      tier,
    );

    expect(out.effects).toEqual([]);
    expect(out.notices).toEqual([
      {
        kind: "Rejected",
        at: 5,
        tool: "confirmEscalation",
        reason: "ticket 4118 has no pending request",
      },
    ]);
  });

  it("both projections are CLOSED matches over TicketStatus (F10)", () => {
    const escalating = escalation.arm(
      slice,
      { outcome: "ok", tool: "requestEscalation", ticket: "4118" },
      5,
      agent,
    ).slice;

    expect(escalation.view(slice).rows).toEqual([
      { ticket: "4118", status: "open", canEscalate: true, escalating: false, escalated: false },
    ]);
    expect(escalation.view(escalating).rows).toEqual([
      {
        ticket: "4118",
        status: "escalating",
        canEscalate: false,
        escalating: true,
        escalated: false,
      },
    ]);
    expect(escalation.contextLines(escalating)).toEqual([
      "ticket 4118: escalation requested, awaiting a different authority",
    ]);
  });
});
