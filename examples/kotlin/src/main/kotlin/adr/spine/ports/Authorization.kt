// ── spine/ports/authorization — the product-owned seam (14.3, 17.1) ────────
// This is where F3's unattended confirmer becomes representable and where F13's
// per-tenant budget belongs. Both are enforced at the BOUNDARY, before the fold,
// and their verdict rides the committed record as an ordered G9 fixture — so a
// re-fold reproduces the decision without calling either of these again.
//
// Note what does NOT happen here: Actor does not grow a variant. 5.1 fixes the
// actor contract at two values and says it "does not grow with the application".
// Authority is an opaque id, so a tenth kind of confirmer adds no type and no case.

package adr.spine.ports

import adr.contract.ToolResult
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.SessionId
import adr.spine.pure.Signature

/**
 * Who is this action being admitted for? Resolved once per step, at the boundary.
 * The agent's own run, a policy tier, a second-agent reviewer, a deferred approval
 * queue and a human host are all just different Authority values.
 */
interface AuthorityResolver {
    fun authorityOf(by: Actor, session: SessionId): Authority
}

/**
 * May THIS authority confirm THIS irreversible action, given that `requestedBy`
 * asked for it? The self-confirm case is already denied structurally by the gate;
 * this seam is where a product adds its own rules on top.
 */
interface ConfirmPolicy {
    fun mayConfirm(sig: Signature, result: ToolResult, requestedBy: Authority): Boolean
}
