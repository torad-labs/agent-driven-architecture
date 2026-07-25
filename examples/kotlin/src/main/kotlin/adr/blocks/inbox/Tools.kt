// ── blocks/inbox/tools — the Verb table ────────────────────────────────────
//   noteDrop   Reversible   an input was conflated away or deduped
//   noteFault  Reversible   a turn threw, or a cancel deadline blew
//
// Both are ordinary verbs called through the ordinary path. The consumer never
// touches this block: it reports a spine-shaped `ConsumerEvent`, app/wire maps it to
// these Actions, and they travel resolveAction → gate → fold → commit → signed
// Command like everything else. If an app wires a consumer but NOT this block, the
// Action resolves to a committed `Unhandled` — still on the timeline, still
// observable, never silent.
//
// The decoders guard an OPEN input (6.10): `reason` arrives as a string off the
// wire, so its `when` keeps its else arm and an unknown word fails to decode into a
// committed Unhandled rather than being guessed at.

package adr.blocks.inbox

import adr.contract.InboxCommand
import adr.contract.InboxResult
import adr.spine.pure.RawInput
import adr.spine.pure.SourceName
import adr.spine.pure.ToolName
import adr.spine.pure.Verb
import adr.spine.pure.text

val NOTE_DROP = ToolName("noteDrop")
val NOTE_FAULT = ToolName("noteFault")

data class NoteDropInput(val source: SourceName, val reason: DropReason, val dropped: Int)

data class NoteFaultInput(val source: SourceName, val fault: String)

/** OPEN input, guarded: an unrecognised word is a decode failure, never a default. */
private fun dropReasonOf(name: String): DropReason? = when (name) {
    "Conflated" -> DropReason.Conflated
    "Duplicate" -> DropReason.Duplicate
    else -> null
}

private fun decodeNoteDrop(raw: RawInput): NoteDropInput? {
    val source = raw.text("source") ?: return null
    val reason = raw.text("reason")?.let(::dropReasonOf) ?: return null
    val dropped = raw.text("dropped")?.toIntOrNull() ?: return null
    return NoteDropInput(SourceName(source), reason, dropped)
}

private fun decodeNoteFault(raw: RawInput): NoteFaultInput? {
    val source = raw.text("source") ?: return null
    val fault = raw.text("fault") ?: return null
    return NoteFaultInput(SourceName(source), fault)
}

fun <S> inboxVerbs(lens: (S) -> InboxSlice): List<Verb<S, *, *>> = listOf(
    Verb.Reversible(
        name = NOTE_DROP,
        describe = "Record that inputs from a source were dropped while the agent was busy.",
        decode = ::decodeNoteDrop,
        run = { input, _ ->
            InboxResult.NoteDrop(NOTE_DROP, input.source, input.reason, input.dropped)
        },
        sign = { r, sig, id -> InboxCommand.NoteDrop(r.tool, sig, id, r.source, r.reason, r.dropped) },
    ),
    Verb.Reversible(
        name = NOTE_FAULT,
        describe = "Record that a turn failed or was abandoned, with its cause.",
        decode = ::decodeNoteFault,
        run = { input, _ -> InboxResult.NoteFault(NOTE_FAULT, input.source, input.fault) },
        sign = { r, sig, id -> InboxCommand.NoteFault(r.tool, sig, id, r.source, r.fault) },
    ),
)
