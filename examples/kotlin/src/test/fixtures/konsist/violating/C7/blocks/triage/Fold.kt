// BLOCK-TEST C7 (F1) — an ARM mints a ToolResult.
// The fold's job is to consume results, not to make them. A result manufactured
// here never went through the boundary's name->ToolResult map, so it was never
// gated and never committed as what was actually folded — which is precisely the
// disagreement between "what was recorded" and "what was decided" that F1 named.
package adr.blocks.triage

import adr.contract.TriageResult
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName

fun rewrite(tool: ToolName, ticket: TicketId): TriageResult =
    TriageResult.SetPriority(tool, ticket, "Urgent")
