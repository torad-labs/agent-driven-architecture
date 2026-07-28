// ── ALLOW-TEST for gate checks C4(d), C6 and C7 (G1 / 12.4 / G1) ──────────
// The SAME four constructions, in the one seam entitled to make them. This is the
// half that keeps the rules honest: C4(d) does not ban the Signature type, it bans
// minting one anywhere but here; C6 does not ban RunStatus, it bans a BLOCK
// reaching the session banner; C7 does not ban Refused, it bans anyone but the
// gate deciding a refusal.
//
// Note the last function: reading `sig.by` and `sig.authority` is legal EVERYWHERE
// and is not what these rules are about. 5.2's "preserved for audit, not for
// branching" survives intact — a block may read the stamp, it may not forge one.
//
// EXPECTED: no findings.

package fixture.compliant.spine.boundary

import adr.contract.ToolResult
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.RunStatus
import adr.spine.pure.Signature
import adr.spine.pure.ToolName

fun stamp(by: Actor, authority: Authority): Signature = Signature(by, authority)

fun budgetExceeded(cause: String): RunStatus = RunStatus.Degraded(cause)

fun appendFailed(fault: String): RunStatus = RunStatus.Error(fault)

fun refuse(tool: ToolName, reason: String): ToolResult = ToolResult.Refused(tool, reason)

/** Reading the stamp is not minting it. Every block may do this. */
fun describe(sig: Signature): String = "${sig.by} under ${sig.authority.id}"
