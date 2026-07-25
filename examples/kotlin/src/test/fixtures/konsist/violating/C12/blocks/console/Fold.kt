// BLOCK-TEST C12 (4.6/A1) — ephemeral view-state reaches the FOLD.
// The moment a scroll offset can be folded it is on the timeline, in the audit
// record and in the replay comparison — and every re-fold now has to reproduce a
// number that means nothing outside one browser tab. 4.6's test is the one that
// settles it: losing this field on a re-fold changes nothing the system believes
// and nothing the artifact contains, so it is not truth and it does not fold.
package adr.blocks.console

import adr.spine.pure.ArmOut

fun consoleArm(slice: ConsoleSlice, view: ViewState): ArmOut<ConsoleSlice> =
    ArmOut(slice.copy(lastScroll = view.scrollOffset))
