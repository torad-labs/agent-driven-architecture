// ALLOW-TEST C4 — a pure tool that returns raw inputs and asks nobody's identity.
// `requestedBy` reads which AUTHORITY asked out of committed State; it never names
// the Actor, and it never mints a stamp. That lens is the whole of 14.3's
// "a different actor than the one that issued the Request", implemented as a
// different PRINCIPAL rather than as "a human".
package adr.blocks.escalation

import adr.contract.EscalationResult
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

val CONFIRM_ESCALATION = ToolName("confirmEscalation")

fun confirm(ticket: TicketId): EscalationResult =
    EscalationResult.ConfirmEscalation(CONFIRM_ESCALATION, ticket)
