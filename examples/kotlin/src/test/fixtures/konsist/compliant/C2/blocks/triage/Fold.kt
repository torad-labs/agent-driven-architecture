// ALLOW-TEST C2 — the block's own transport, plus the SPINE-owned roots.
// ToolResult, Command and Effect are the spine's, so every block may name them;
// what a block may not name is another block's cases. Blocks talk by reading a
// sibling's slice off the folded State as a value, or by dispatching a verb the
// sibling's arm folds.
package adr.blocks.triage

import adr.contract.ToolResult
import adr.contract.TriageEffect
import adr.contract.TriageResult
import adr.spine.pure.Timestamp

fun triageArm(result: TriageResult, now: Timestamp): List<TriageEffect> = emptyList()

fun spineOwned(result: ToolResult): String = result.tool.value
