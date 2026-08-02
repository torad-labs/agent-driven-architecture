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
// boundary (6.10), and the ARM is what validates against state (12.4).
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
//
// THE UPCASTER LIVES HERE, and not in Contract.kt, because gate check C7 puts it
// here: a block mints its own ToolResults in this file and nowhere else, and
// `TriageUpcast.v1` produces one. The v1 SHAPE is declared next to the v2 shape it
// evolved from (Contract.kt); the LIFT is a production site.

package adr.blocks.triage

import adr.contract.TriageCommand
import adr.contract.TriageResult
import adr.contract.TriageResult.Priority
import adr.contract.TriageV1Result
import adr.spine.pure.Lens
import adr.spine.pure.RawInput
import adr.spine.pure.TicketId
import adr.spine.pure.ToolName
import adr.spine.pure.Verb

val SET_PRIORITY = ToolName("setPriority")

/**
 * What a v1 record's missing `reason` becomes on the way into the fold (14.7).
 *
 * NOT `null`: `null` is v2's word for "the caller gave none", and a v1 record never
 * had the field at all. An upcaster that erased that distinction would be inventing
 * history rather than lifting it.
 */
const val PRE_V2_REASON = "not recorded (pre-v2 record)"

internal data class SetPriorityInput(val ticket: TicketId, val level: Priority, val reason: String?)

/**
 * THE WORKED UPCASTER (14.7), v1 -> v2 for this block's one payload.
 *
 * Pure and total: every v1 result has exactly one v2 form. It holds nothing, so the
 * constructor is empty — the honest result of the split rule, as in TriageArm. It
 * never touches the record it came from; the caller gets a NEW value on the way into
 * the fold, which is the difference between upcasting and the history rewrite 14.1
 * forbids.
 */
class TriageUpcast {

    fun v1(old: TriageV1Result.SetPriority): TriageResult.SetPriority =
        TriageResult.SetPriority(old.tool, old.ticket, old.level, PRE_V2_REASON)
}

internal class TriageTools<S>(private val lens: Lens<S, TriageSlice>) {

    fun verbs(): List<Verb<S, *, *>> = listOf(
        Verb.Reversible(
            name = SET_PRIORITY,
            describe = "Set a support ticket's priority (Low | Normal | High | Urgent).",
            decode = ::decodeSetPriority,
            run = { input, _ ->
                TriageResult.SetPriority(SET_PRIORITY, input.ticket, input.level, input.reason)
            },
            // The Command does NOT mirror the new field, and the asymmetry is 14.7
            // doing its job: a Command is the SIGNED record of what a principal
            // authorized, and 14.1 forbids rewriting it — so the Command shape that was
            // signed is the shape that stays. What the fold consumes is the RESULT.
            sign = { r, sig, id -> TriageCommand.SetPriority(r.tool, sig, id, r.ticket, r.level) },
            narrow = { it as? TriageResult.SetPriority },
        ),
    )

    private fun decodeSetPriority(raw: RawInput): SetPriorityInput? {
        val ticket = raw.text("ticket") ?: return null
        val level = raw.text("level")?.let { name -> Priority.entries.firstOrNull { it.name == name } }
            ?: return null
        // `reason` is the v2 field and it is OPTIONAL at the schema too: an adopter's
        // existing callers keep working, which is the other half of what 14.7's
        // "optional field" buys. A missing field decodes to null, never to a failure.
        return SetPriorityInput(TicketId(ticket), level, raw.text("reason"))
    }
}
