// ── blocks/console/register — THE ONE PUBLIC SYMBOL (I7, L1) ───────────────
// Identical in shape to blocks/triage/register and blocks/escalation/register. A
// presentation block plugs in exactly like a domain block (A1) — and it is a
// CONSTRUCTED class for the same reason they are.
//
// The block's own projection takes a second, EPHEMERAL argument (see
// blocks/console/project). It stops here: `view(slice)` takes the default, so nothing
// outside the block — and nothing on the `Block` interface — can hand the console a
// scroll offset. This file may not even name `ViewState` (gate check C12).

package adr.blocks.console

import adr.contract.ConsoleResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Block
import adr.spine.pure.BlockRegistration
import adr.spine.pure.PanelId
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class ConsoleBlock : Block<ConsoleSlice, ConsoleResult, ConsoleView> {

    private val armImpl = ConsoleArm()
    private val projection = ConsoleProjection()

    fun <S> register(lens: (S) -> ConsoleSlice): BlockRegistration<S> =
        BlockRegistration(block = "console", verbs = ConsoleTools(lens).verbs())

    override fun arm(
        slice: ConsoleSlice,
        result: ConsoleResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<ConsoleSlice> = armImpl.arm(slice, result, now, sig)

    /** The SEEDED slice — on the block, not on a companion of the shape. */
    fun slice(panels: List<PanelId>): ConsoleSlice =
        ConsoleSlice(panels = panels.associateWith { false })

    override fun view(slice: ConsoleSlice): ConsoleView = projection.view(slice)

    fun contextLines(slice: ConsoleSlice): List<String> = projection.contextLines(slice)
}
