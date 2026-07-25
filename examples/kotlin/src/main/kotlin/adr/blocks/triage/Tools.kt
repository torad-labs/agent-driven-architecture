// ── blocks/triage/tools — the Verb table ───────────────────────────────────
// One row per verb: name, description, input schema, PURE body, name→Command entry,
// reversibility. Registering a tool FORCES the reversibility decision; there is no
// default (14.3 default-deny, made structural).
//
// The tools are pure: they read Ctx and return a payload. They cannot name an
// Actor, an Authority or a Signature (gate check C4) — the stamp does not exist yet
// when they run.
//
// The input schema stays a plain string for `ticket`: the ticket set is OPEN at the
// boundary (6.10), and the ARM is what validates against state (F9).
//
// The table and its decoder are members of a CONSTRUCTED type. `lens` is the one
// argument the split rule promotes to constructor state: it is fixed for a whole
// registration and shared by every row, exactly as the registry is shared by the
// boundary's two maps. Triage's single row does not happen to READ the lens — its arm
// validates against the slice instead — but the parameter is what keeps all six blocks
// registering identically at the root, and blocks/escalation/tools shows the row that
// genuinely needs it.
//
// `decodeSetPriority` is now PRIVATE TO THE TABLE THAT USES IT. `::decodeSetPriority`
// still reads the same at the call site; it is a bound reference to this instance's
// member rather than a pointer to a file-scope function nothing owns.

package adr.blocks.triage

import adr.contract.TriageCommand
import adr.contract.TriageResult
import adr.spine.pure.RawInput
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName
import adr.spine.pure.Verb

val SET_PRIORITY = ToolName("setPriority")

data class SetPriorityInput(val ticket: TicketId, val level: Priority)

class TriageTools<S>(private val lens: (S) -> TriageSlice) {

    fun verbs(): List<Verb<S, *, *>> = listOf(
        Verb.Reversible(
            name = SET_PRIORITY,
            describe = "Set a support ticket's priority (Low | Normal | High | Urgent).",
            decode = ::decodeSetPriority,
            run = { input, _ -> TriageResult.SetPriority(SET_PRIORITY, input.ticket, input.level) },
            sign = { r, sig, id -> TriageCommand.SetPriority(r.tool, sig, id, r.ticket, r.level) },
            narrow = { it as? TriageResult.SetPriority },
        ),
    )

    private fun decodeSetPriority(raw: RawInput): SetPriorityInput? {
        val ticket = raw.text("ticket") ?: return null
        val level = raw.text("level")?.let { name -> Priority.entries.firstOrNull { it.name == name } }
            ?: return null
        return SetPriorityInput(TicketId(ticket), level)
    }
}
