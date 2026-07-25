// ── blocks/console/register — THE ONE PUBLIC SYMBOL (I7, L1) ───────────────
// Identical in shape to blocks/triage/register and blocks/escalation/register. A
// presentation block plugs in exactly like a domain block (A1).

package adr.blocks.console

import adr.contract.ConsoleResult
import adr.spine.pure.ArmOut
import adr.spine.pure.BlockRegistration
import adr.spine.pure.PanelId
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

object Console {
    val initial: ConsoleSlice get() = ConsoleSlice(focused = null, panels = emptyMap())

    fun slice(panels: List<PanelId>): ConsoleSlice = ConsoleSlice.of(panels)

    fun <S> register(lens: (S) -> ConsoleSlice): BlockRegistration<S> =
        BlockRegistration(block = "console", verbs = consoleVerbs(lens))

    fun arm(
        slice: ConsoleSlice,
        result: ConsoleResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<ConsoleSlice> = consoleArm(slice, result, now, sig)

    fun view(slice: ConsoleSlice): ConsoleView = consoleView(slice)

    fun contextLines(slice: ConsoleSlice): List<String> = consoleContextLines(slice)
}
