// THE VIOLATION, and it is exactly one: this block declares TWO verbs and its Verb
// table holds ONE classified row. `noteReversal`'s transport exists, its arm exists,
// and its plumbing is still written here — so the block still NAMES both cases in all
// three files and every other clause of row 1 is satisfied. Only site 3 is missing,
// which is what makes the BLOCK-TEST's message equality a test of ONE clause rather
// than of "something went wrong".

package adr.blocks.ledger

import adr.contract.LedgerCommand
import adr.contract.LedgerResult
import adr.spine.pure.CommandId
import adr.spine.pure.Lens
import adr.spine.pure.RawInput
import adr.spine.pure.Signature
import adr.spine.pure.SourceName
import adr.spine.pure.ToolName
import adr.spine.pure.Verb

val NOTE_ENTRY = ToolName("noteEntry")
val NOTE_REVERSAL = ToolName("noteReversal")

data class NoteEntryInput(val source: SourceName, val line: String)

class LedgerTools<S>(private val lens: Lens<S, LedgerSlice>) {

    fun verbs(): List<Verb<S, *, *>> = listOf(
        Verb.Reversible(
            name = NOTE_ENTRY,
            describe = "Record a ledger entry.",
            decode = ::decodeNoteEntry,
            run = { input, _ -> LedgerResult.NoteEntry(NOTE_ENTRY, input.source, input.line) },
            sign = { r, sig, id -> LedgerCommand.NoteEntry(r.tool, sig, id, r.source, r.line) },
            narrow = { it as? LedgerResult.NoteEntry },
        ),
    )

    /** The second verb's ROW was deleted; only its signing plumbing survives here. */
    fun signReversal(r: LedgerResult.NoteReversal, sig: Signature, id: CommandId): LedgerCommand =
        LedgerCommand.NoteReversal(r.tool, sig, id, r.source, r.entry)

    private fun decodeNoteEntry(raw: RawInput): NoteEntryInput? {
        val source = raw.text("source") ?: return null
        val line = raw.text("line") ?: return null
        return NoteEntryInput(SourceName(source), line)
    }
}
