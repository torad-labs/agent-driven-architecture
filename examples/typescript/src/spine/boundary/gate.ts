// ── spine/boundary/gate — the irreversibility gate (G1, G6; 14.3) ──────────
// PRE-FOLD, AT THE BOUNDARY, KEYED ON AUTHORITY.
//
// The shipped reference branched inside the fold on an Actor the TOOL had
// copied into its own payload, while the boundary stamped a different Actor one
// line later — two unreconciled values, and the stamp was causally incapable of
// gating. Here there is only ONE value, `sig`, it is created after every tool
// has returned, and the gate reads it before the fold sees anything.
//
// 14.3 requires "a different ACTOR than the one that issued the Request".
// `by == Human` does not implement that — it implements "a human". What is
// implemented below is `sig.authority != the authority recorded in State when
// the Request was raised`: a different PRINCIPAL than the one that asked. That
// is what the sentence says, and it is what an unattended deployment needs:
//
//   confirmer                        sig.by   sig.authority     verdict
//   the agent re-confirming its own   Agent    agent-run-7f      REFUSED (self-confirm)
//   a policy tier approving by rules  Agent    policy-tier-v3    granted
//   a second-agent reviewer           Agent    reviewer-a2       granted
//   a human host                      Human    host:marcos       granted
//   a deferred approval queue         Agent    approval-queue    granted
//   the agent confirming a SPINE-
//     requested drain seal            Agent    agent-run-7f      granted
//
// The confirming Command still stamps its Actor TRUTHFULLY; the Authority is
// the field that differs. No second bus (5.2 holds); recall confers no
// authority (11.3 holds); and no row above adds an Actor variant — the actor
// contract grows only at architecture revision, never per application.
//
// THE LAST ROW IS NEW, AND IT IS THE ONE THAT SURPRISES. `agent-run-7f` appears
// twice with opposite verdicts: refused when the run itself raised the Request,
// granted when the SPINE did (`spine:consumer`, the consumer's own principal for
// conflations, faults, blown deadlines and the drain seal). Nothing about the
// confirmer changed — the REQUESTER did, and this gate compares principals, so a
// drain-requested seal is no longer a self-confirm. Pinned in both ports by
// `14.3 — the drain-requested seal and its confirmer`.
//
// A refusal is COMMITTED as `ToolResult.Refused`, so a re-fold reproduces the
// verdict without calling the authorization seam again — G9 satisfied, and G6's
// and G6's "captured as an ordered G9 fixture" are the same mechanism, not two.

import type { Authorization } from "../ports/authorization";
import type { Signature } from "../pure/actor";
import type { SealedResult } from "../pure/tool-result";
import { isSpineResult, refused, seal } from "../pure/tool-result";
import type { Registry } from "./action";

export function gate<S>(
  result: SealedResult,
  sig: Signature,
  state: S,
  registry: Registry<S>,
  authz: Authorization<S>,
): SealedResult {
  // Already a spine verdict (no verb ran, or an input failed to decode) —
  // there is nothing to gate, and it is already the thing that gets committed.
  if (isSpineResult(result)) return result;
  const verb = registry.get(result.tool);
  // Unreachable via resolveAction; kept total rather than thrown.
  if (verb === undefined) return seal(refused(result.tool, "no registered verb"));
  switch (verb.kind) {
    case "Reversible":
      return result;
    case "Irreversible": {
      const requester = verb.requestedBy(state, result);
      if (requester === null) return seal(refused(result.tool, "no pending request"));
      if (requester === sig.authority) {
        return seal(
          refused(
            result.tool,
            "self-confirm: the confirming authority is the requesting authority",
          ),
        );
      }
      return authz.mayConfirm(sig, result, state)
        ? result
        : seal(refused(result.tool, "authority may not confirm this action"));
    }
    default: {
      const _never: never = verb;
      return _never;
    }
  }
}
