// ALLOW-TEST C7 — the arm MATCHES on the same variant, exhaustively.
// `is TriageResult.SetPriority ->` is how every arm in the system is written, and
// it stays legal everywhere. C7 denies CONSTRUCTION, not reference: the closed
// match that F10 and §11.2 depend on would be impossible under a rule that banned
// naming the case at all.
package adr.blocks.triage

import adr.contract.TriageResult

fun describe(result: TriageResult): String = when (result) {
    is TriageResult.SetPriority -> "priority ${result.level} for ${result.ticket.value}"
}
