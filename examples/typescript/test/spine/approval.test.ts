// ── SDK-6 / APPROVAL-SEAM — in FRONT of the gate, never instead of it ────────
// THE VERSION MATTERS HERE, and getting it wrong twice is the story of this item.
// The audit first recommended `needsApproval` from type inspection. A later pass
// read the published docs — "use needsApproval only with WorkflowAgent; use
// toolApproval" — and retracted it. That retraction applied v7 documentation to a
// v6 tree: at the pinned version `toolApproval` DOES NOT EXIST as a setting
// (only `experimental_toolApprovalSecret` does), and `needsApproval` on `Tool`
// does. So the original recommendation was right for this codebase all along.
//
// WHAT THIS IS NOT. It does not replace the gate. The request/confirm rule — an
// Irreversible verb needs a pending request raised by a DIFFERENT principal — is
// a book law, enforced pre-fold, and its refusal is COMMITTED. The runtime's
// approval flow carries no principal identity, so it cannot express "a policy
// tier may confirm, this run may not" where both are truthfully `Agent`.
//
// What it adds is the OTHER kind of caution the gate never expressed: "ask a
// person first", which is a deployment's call rather than a law's.

import { object, string } from "valibot";
import { describe, expect, it } from "vitest";
import { buildTools } from "../../src/spine/agent/loop";
import { reversible } from "../../src/spine/pure/verb";
import { harness } from "../harness";

describe("SDK-6 — approval is declarable per verb and additive", () => {
  it("defaults to absent, so the boundary decides alone", () => {
    const h = harness();
    const tools = buildTools(h.app.registry, h.app.boundary, h.app.dispatchers);

    // No shipped verb declares it: behaviour is byte-identical to before.
    expect(tools.requestEscalation?.needsApproval).toBeUndefined();
    expect(tools.setPriority?.needsApproval).toBeUndefined();
  });

  it("carries a block's predicate through to the tool definition", () => {
    const h = harness();
    const verb = reversible<
      unknown,
      { note: string },
      { outcome: "ok"; tool: "setPriority" },
      never
    >({
      name: "setPriority",
      describe: "declares approval from inside the block",
      schema: object({ note: string() }),
      run: () => {
        throw new Error("not run in this test");
      },
      sign: () => {
        throw new Error("not signed in this test");
      },
      needsApproval: (input) => input.note === "large",
    });

    const tools = buildTools(new Map([["setPriority", verb]]), h.app.boundary, h.app.dispatchers);
    const declared = tools.setPriority?.needsApproval;

    expect(typeof declared).toBe("function");
  });

  it("leaves the COMMITTED REFUSAL law untouched — the gate still refuses a self-confirm", () => {
    const h = harness();

    // Raise, then try to confirm from the SAME authority. This is the law the
    // approval seam must never be able to soften: refused pre-fold, and the
    // refusal is on the timeline.
    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "requestEscalation", input: { ticket: "4118" } }],
    });
    h.app.boundary.agent.submit({
      staged: [],
      actions: [{ tool: "confirmEscalation", input: { ticket: "4118" } }],
    });

    expect(h.app.bus.records().at(-1)?.results.at(-1)).toMatchObject({ outcome: "refused" });
  });
});
