// ── blocks/console/fold — the block's ARM ──────────────────────────────────
// A presentation arm obeys the SAME three rules as a domain arm (§7): read state,
// gate the effect on success, reject per-item. It has no effects at all — a
// presentation decision changes what the system believes, not what the world sees —
// so rule 2 is satisfied vacuously and rule 1 and 3 are doing real work.

package adr.blocks.console

import adr.contract.ConsoleResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

fun consoleArm(
    slice: ConsoleSlice,
    result: ConsoleResult,
    now: Timestamp,
    sig: Signature,
): ArmOut<ConsoleSlice> = when (result) {
    is ConsoleResult.FocusTicket ->
        if (slice.focused == result.ticket) {
            ArmOut(
                slice = slice,
                notices = listOf(
                    Notice.Rejected(
                        now,
                        result.tool,
                        "ticket ${result.ticket.value} is already focused",
                    ),
                ),
            )
        } else {
            ArmOut(slice = slice.withFocus(result.ticket))
        }

    is ConsoleResult.SetPanel ->
        if (!slice.panels.containsKey(result.panel)) {
            ArmOut(
                slice = slice,
                notices = listOf(
                    Notice.Rejected(now, result.tool, "no panel named ${result.panel.value}"),
                ),
            )
        } else {
            ArmOut(slice = slice.withPanel(result.panel, result.visible))
        }
}
