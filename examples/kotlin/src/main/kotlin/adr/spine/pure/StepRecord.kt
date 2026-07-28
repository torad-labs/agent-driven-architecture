// ── spine/pure/step-record — THE unit of commit and THE unit of replay (G9) ─
// The shipped reference committed `append(signedCommands, capturedResults)` — no
// clock. A live boundary that folded at now=1001 re-folded at now=0, because the
// only thing that could have carried the timestamp was never written down.
//
// The commit is the STEP, not the pair. `now` rides the record, or a re-fold
// cannot reproduce what a live boundary wrote.
//
// All seven fields earn their place:
//   now       the injected clock read — without it, timestamps are lost outright
//   sig       the stamp the fold was given (who acted + under whose permission)
//   staged    the ordered off-bus input this step consumed (5.4)
//   actions   what was ASKED — differs from `results` whenever the gate refused
//   results   POST-GATE — exactly what was FOLDED
//   commands  the signed record, with the minted ids that cannot be re-derived
//   context   promptVersion + the rendered digest the model saw (G15/14.7)

package adr.spine.pure

import adr.contract.Command
import adr.contract.ToolResult

data class StepRecord(
    val now: Timestamp,
    val sig: Signature,
    val staged: List<StagedInput>,
    val actions: List<Action>,
    val results: List<ToolResult>,
    val commands: List<Command>,
    val context: ContextFixture,
)
