// ALLOW-TEST C12 — the arm folds DECISIONS and never sees the ephemeral state.
// 6.8's axis, applied: showing a panel is an authored act, so it is a verb that
// folds and signs exactly like setPriority. The scroll offset is not, so the arm
// cannot name it.
package adr.blocks.console

import adr.contract.ConsoleResult
import adr.spine.pure.ArmOut

fun consoleArm(slice: ConsoleSlice, result: ConsoleResult): ArmOut<ConsoleSlice> = when (result) {
    is ConsoleResult.FocusTicket -> ArmOut(slice.copy(focused = result.ticket))
    is ConsoleResult.SetPanel -> ArmOut(slice.withPanel(result.panel, result.visible))
}
