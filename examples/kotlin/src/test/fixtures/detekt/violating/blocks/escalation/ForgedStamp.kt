// ── BLOCK-TEST for gate checks C4(d), C6 and C7 (G1 / 12.4 / G1) ──────────
// One file, three of the exact failures the findings measured. It names the REAL
// transport types — the rules match RESOLVED constructors, so a fixture that made
// up its own local `Signature` would prove nothing.
//
//   C4(d)  G1 — a block mints its own stamp. The shipped reference had two
//               unreconciled actor values: one the tool copied into its payload
//               and branched on, one the boundary stamped after the fold had
//               already run. Making a Signature here is how that comes back.
//   C6     12.4 — a per-item failure reaches for the SESSION status. Measured:
//               "one bad ticket leaves the banner degraded for the rest of the
//               session."
//   C7     G1 — a block mints the boundary's own Refused verdict, so a committed
//               result could disagree with what the gate actually decided.
//
// EXPECTED: detekt.ForbiddenMethodCall fires four times.

package fixture.violating.blocks.escalation

import adr.contract.ToolResult
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.RunStatus
import adr.spine.pure.Signature
import adr.spine.pure.ToolName

fun forgeStamp(): Signature = Signature(Actor.Human, Authority("host:marcos"))

fun poisonTheSession(cause: String): RunStatus = RunStatus.Degraded(cause)

fun failTheSession(fault: String): RunStatus = RunStatus.Error(fault)

fun mintARefusal(tool: ToolName): ToolResult = ToolResult.Refused(tool, "not allowed")
