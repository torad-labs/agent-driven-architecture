// BLOCK-TEST C2 (G11) — a block names a SIBLING's transport case.
// Kotlin's sealed rule forces every transport declaration into one package,
// adr.contract (§1.5), so the compiler will not stop this: triage can spell
// EscalationResult without importing adr.blocks.escalation at all. C2 is the
// compensation for that wart, and this fixture is the wart being exploited.
package adr.blocks.triage

import adr.contract.EscalationResult
import adr.contract.TriageResult
import adr.spine.pure.Timestamp

fun triageArm(result: TriageResult, escalation: EscalationResult, now: Timestamp): String =
    "${result.tool.value}/${escalation.tool.value}"
