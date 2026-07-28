// ── spine/boundary/gate — the irreversibility gate, PRE-FOLD (G1/G6) ───────
// The shipped reference branched on `r.by`, an Actor the TOOL copied into its own
// payload, while the log recorded a different Actor the boundary stamped after the
// fold had already run. Two unreconciled values, and the stamp was causally
// INCAPABLE of gating.
//
// Here there is exactly one value, it is created AFTER the tool has returned, and
// the check runs BEFORE the fold — which is where 14.3 always said it goes.
//
// What it compares (14.3 implemented, not paraphrased): the CONFIRMING authority
// against the REQUESTING authority recorded in State. "A different actor than the
// one that issued the Request" is not implemented by `by == Human` — that
// implements "a human". It is implemented by comparing principals.
//
// A refusal is COMMITTED as ToolResult.Refused, so it re-folds without re-running
// the authorization check (G9). G6's "captured as an ordered G9 fixture" and its per-tenant budget's
// "verdict captured as an ordered G9 fixture" are the SAME mechanism, not two.

package adr.spine.boundary

import adr.contract.ToolResult
import adr.spine.ports.ConfirmPolicy
import adr.spine.pure.Gating
import adr.spine.pure.Registry
import adr.spine.pure.Signature

/**
 * The gate itself, over the registry and the confirm policy it is built with. The
 * per-step values — the result, the signature, the state — are the arguments.
 *
 * Constructed by the Boundary, never injected into it. `policy` is the seam a test is
 * meant to vary; the gate AROUND it is the invariant, and a gate that could be bound
 * from outside is a gate that could be bypassed from outside.
 */
class IrreversibilityGate<S>(
    private val registry: Registry<S>,
    private val policy: ConfirmPolicy,
) {
    fun check(result: ToolResult, sig: Signature, state: S): ToolResult {
        // An unresolvable action never had a verb to gate; it is already a decision.
        if (result is ToolResult.Unhandled) return result

        val verb = registry[result.tool]
            ?: return ToolResult.Unhandled(result.tool, "no registered verb")

        return when (val gating = verb.gating(state, result)) {
            Gating.Ungated -> result
            is Gating.NeedsConfirmation -> when {
                gating.requestedBy == null ->
                    ToolResult.Refused(result.tool, "no pending request")

                gating.requestedBy == sig.authority ->
                    ToolResult.Refused(
                        result.tool,
                        "self-confirm: the confirming authority is the requesting authority",
                    )

                !policy.mayConfirm(sig, result, gating.requestedBy) ->
                    ToolResult.Refused(result.tool, "authority may not confirm this action")

                else -> result
            }
        }
    }
}
