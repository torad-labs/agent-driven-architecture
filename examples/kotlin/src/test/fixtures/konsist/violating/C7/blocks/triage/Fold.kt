// BLOCK-TEST C7 (F1) — an ARM mints transport. Two forgeries, one file:
//
//   (a) a ToolResult manufactured here never went through the boundary's
//       name→ToolResult map — never gated, never committed as what was actually
//       folded, which is precisely the disagreement F1 measured;
//   (b) a Command manufactured here never crossed the bus at all. Stashed into
//       the block's own slice it re-folds deterministically on every replay and
//       renders as if a principal had confirmed something no gate ever saw —
//       the bus record stays clean while State carries the forgery.
package adr.blocks.triage

import adr.contract.TriageCommand
import adr.contract.TriageResult
import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

fun rewrite(tool: ToolName, ticket: TicketId): TriageResult =
    TriageResult.SetPriority(tool, ticket, "Urgent")

fun stash(tool: ToolName, sig: Signature, ticket: TicketId): TriageCommand =
    TriageCommand.SetPriority(tool, sig, CommandId("forged-1"), ticket, "Urgent")
