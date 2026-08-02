// THE COMPLIANT HALF, and it is deliberately not spelled the way the live tree spells
// it. Both verbs are here — two cases, two classified rows, one signed table — but the
// first row is bound through a STAR import of the spine package and the second through
// an ALIASED NESTED import of the classification itself. Neither construction contains
// the text `Verb.Reversible(`.
//
// That is the whole point of the pair. A clause that matched the literal spelling would
// see zero rows here and reject a block that is correct in every respect, which is a
// false positive on idiomatic code and the failure this fixture exists to keep out. The
// census resolves the rebinding from this file's own import lines instead, so both rows
// are counted and the ALLOW-TEST is silent.

package adr.blocks.ledger

import adr.contract.LedgerCommand
import adr.contract.LedgerResult
import adr.spine.pure.*
import adr.spine.pure.Verb.Reversible as Rev

val NOTE_ENTRY = ToolName("noteEntry")
val NOTE_REVERSAL = ToolName("noteReversal")

data class NoteEntryInput(val source: SourceName, val line: String)

data class NoteReversalInput(val source: SourceName, val entry: String)

class LedgerTools<S>(private val lens: Lens<S, LedgerSlice>) {

    fun verbs(): List<Verb<S, *, *>> = listOf(
        // Bound through the star import: `Verb` is in scope without being named.
        Verb.Reversible(
            name = NOTE_ENTRY,
            describe = "Record a ledger entry.",
            decode = ::decodeNoteEntry,
            run = { input, _ -> LedgerResult.NoteEntry(NOTE_ENTRY, input.source, input.line) },
            sign = { r, sig, id -> LedgerCommand.NoteEntry(r.tool, sig, id, r.source, r.line) },
            narrow = { it as? LedgerResult.NoteEntry },
        ),
        // Bound through an aliased nested import: the classification is called `Rev` here.
        Rev(
            name = NOTE_REVERSAL,
            describe = "Reverse a ledger entry.",
            decode = ::decodeNoteReversal,
            run = { input, _ -> LedgerResult.NoteReversal(NOTE_REVERSAL, input.source, input.entry) },
            sign = { r, sig, id -> LedgerCommand.NoteReversal(r.tool, sig, id, r.source, r.entry) },
            narrow = { it as? LedgerResult.NoteReversal },
        ),
    )

    private fun decodeNoteEntry(raw: RawInput): NoteEntryInput? {
        val source = raw.text("source") ?: return null
        val line = raw.text("line") ?: return null
        return NoteEntryInput(SourceName(source), line)
    }

    private fun decodeNoteReversal(raw: RawInput): NoteReversalInput? {
        val source = raw.text("source") ?: return null
        val entry = raw.text("entry") ?: return null
        return NoteReversalInput(SourceName(source), entry)
    }
}
