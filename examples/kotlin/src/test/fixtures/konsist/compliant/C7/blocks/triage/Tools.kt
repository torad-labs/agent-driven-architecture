// ALLOW-TEST C7, the other half — the ONE place a block's transport is produced.
// One registration, two maps: this file supplies the pure `run` that mints the
// ToolResult, and the `sign` entry that turns it into a Command — the two legal
// constructions, in the one file entitled to both.
//
// Note how `sign` never names Signature: the lambda's parameters are inferred
// from the Verb seam, which is what lets C4(b) keep the stamp unnameable in a
// tool file while the sign entry still carries it through.
package adr.blocks.triage

import adr.contract.TriageCommand
import adr.contract.TriageResult
import adr.spine.pure.ToolName
import adr.spine.pure.Verb

val SET_PRIORITY = ToolName("setPriority")

class TriageTools {

    fun verbs(): List<Verb<*, *, *>> = listOf(
        Verb.Reversible(
            name = SET_PRIORITY,
            describe = "Set a support ticket's priority.",
            run = { input, _ -> TriageResult.SetPriority(SET_PRIORITY, input.ticket, input.level) },
            sign = { r, sig, id -> TriageCommand.SetPriority(r.tool, sig, id, r.ticket, r.level) },
        ),
    )
}
