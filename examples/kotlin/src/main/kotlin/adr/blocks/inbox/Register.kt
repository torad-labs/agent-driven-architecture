// ── blocks/inbox/register — THE ONE PUBLIC SYMBOL (L1) ─────────────────
// Identical in shape to every other block's register. The barge-in rung plugs in as
// an ORDINARY BLOCK — that is the whole claim: concurrency machinery is spine,
// concurrency OBSERVABILITY is product state, and neither needed a new mechanic.
//
// "Identical in shape" is now checked rather than claimed: `Block` is an interface the
// compiler holds this class to, and the class is CONSTRUCTED like every other.

package adr.blocks.inbox

import adr.contract.InboxResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Block
import adr.spine.pure.BlockRegistration
import adr.spine.pure.Lens
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class InboxBlock : Block<InboxSlice, InboxResult, InboxView> {

    private val armImpl = InboxArm()
    private val projection = InboxProjection()

    fun <S> register(lens: Lens<S, InboxSlice>): BlockRegistration<S> =
        BlockRegistration(block = "inbox", verbs = InboxTools(lens).verbs())

    override fun arm(
        slice: InboxSlice,
        result: InboxResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<InboxSlice> = armImpl.arm(slice, result, now, sig)

    override fun view(slice: InboxSlice): InboxView = projection.view(slice)

    fun contextLines(slice: InboxSlice): List<String> = projection.contextLines(slice)
}
