// ── blocks/triage/register — THE ONE PUBLIC SYMBOL (I7, L1) ────────────────
// Everything the composition root needs from this block, bundled. Plug the block in
// by registering it at app/wire; pull it out by deleting this folder and that line.
// Nothing outside the block names anything inside it except through this object.
//
// The block is generic in the app's State: it is handed a LENS onto its own slice,
// so it never has to know what else is in State (L1).

package adr.blocks.triage

import adr.contract.TriageResult
import adr.spine.pure.ArmOut
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

object Triage {
    val initial: TriageSlice get() = TriageSlice(emptyMap(), emptyMap())

    fun slice(tickets: List<Ticket>): TriageSlice = TriageSlice.of(tickets)

    fun <S> register(lens: (S) -> TriageSlice): BlockRegistration<S> =
        BlockRegistration(block = "triage", verbs = triageVerbs(lens))

    fun arm(
        slice: TriageSlice,
        result: TriageResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<TriageSlice> = triageArm(slice, result, now, sig)

    fun view(slice: TriageSlice): TriageView = triageView(slice)

    fun contextLines(slice: TriageSlice): List<String> = triageContextLines(slice)
}
