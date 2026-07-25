// ── blocks/inbox/register — THE ONE PUBLIC SYMBOL (I7, L1) ─────────────────
// Identical in shape to every other block's register. The barge-in rung plugs in as
// an ORDINARY BLOCK — that is the whole claim: concurrency machinery is spine,
// concurrency OBSERVABILITY is product state, and neither needed a new mechanic.

package adr.blocks.inbox

import adr.contract.InboxResult
import adr.spine.pure.ArmOut
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

object Inbox {
    val initial: InboxSlice get() = InboxSlice.empty

    fun <S> register(lens: (S) -> InboxSlice): BlockRegistration<S> =
        BlockRegistration(block = "inbox", verbs = inboxVerbs(lens))

    fun arm(
        slice: InboxSlice,
        result: InboxResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<InboxSlice> = inboxArm(slice, result, now, sig)

    fun view(slice: InboxSlice): InboxView = inboxView(slice)

    fun contextLines(slice: InboxSlice): List<String> = inboxContextLines(slice)
}
