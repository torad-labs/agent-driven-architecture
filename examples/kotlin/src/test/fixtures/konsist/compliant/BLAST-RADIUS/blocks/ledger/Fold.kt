// The block's ARM, exhaustive over its own sealed sub-union — the third of row 1's
// three files, and the reason both cases are legitimately named outside the contract.

package adr.blocks.ledger

import adr.contract.LedgerResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class LedgerArm {

    fun arm(
        slice: LedgerSlice,
        result: LedgerResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<LedgerSlice> = when (result) {
        is LedgerResult.NoteEntry -> ArmOut(slice = slice.withEntry(result.line))

        is LedgerResult.NoteReversal -> ArmOut(slice = slice.withReversal(result.entry))
    }
}
