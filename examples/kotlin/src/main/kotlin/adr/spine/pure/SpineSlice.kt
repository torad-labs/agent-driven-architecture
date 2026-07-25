// ── spine/pure/spine-slice — the spine's own slice, and the fold-arm contract ─
// Every block owns a slice of the one folded State; so does the spine. This one
// holds the session-global RunStatus and the per-item Notice list.
//
// ArmOut is the shape EVERY fold arm returns (§7). Three rules, mechanical, no
// exceptions:
//   1. every arm reads current state before it decides;
//   2. every effect push lives inside the success branch;
//   3. a rejection folds a per-item Notice, never RunStatus, and never a mutation.

package adr.spine.pure

import adr.contract.Effect
import adr.contract.ToolResult

data class SpineSlice(val run: RunStatus, val notices: List<Notice>) {
    fun withNotices(more: List<Notice>): SpineSlice =
        if (more.isEmpty()) this else copy(notices = notices + more)

    companion object {
        val initial = SpineSlice(run = RunStatus.Idle, notices = emptyList())
    }
}

/** What one fold arm returns: the new slice, the effects it earned, the notices it left. */
data class ArmOut<S>(
    val slice: S,
    val effects: List<Effect> = emptyList(),
    val notices: List<Notice> = emptyList(),
)

/** The pure decision the boundary injects into itself: (state, results, now, sig) -> (state, effects). */
typealias Fold<S> = (S, List<ToolResult>, Timestamp, Signature) -> Pair<S, List<Effect>>

/**
 * The THIRD pure projection (F4/G15): committed State + this step's ORDERED staged
 * inputs -> Context. Plural because 5.4 already specifies plural off-bus inputs
 * "in their staging order, keyed to the consuming step" — a step may consume a
 * perceived event AND a recall from a peer tier.
 */
typealias ProjectContext<S> = (S, List<StagedInput>) -> Context

/** The spine's arm for an unresolvable action. Identical everywhere (§7). */
fun unhandledArm(slice: SpineSlice, r: ToolResult.Unhandled, now: Timestamp): ArmOut<SpineSlice> =
    ArmOut(
        slice = slice,
        effects = listOf(Effect.Diag(now, r.note)),
        notices = listOf(Notice.Rejected(now, r.tool, r.note)),
    )

/** The spine's arm for a gate refusal. Identical everywhere (§7). */
fun refusedArm(slice: SpineSlice, r: ToolResult.Refused, now: Timestamp): ArmOut<SpineSlice> =
    ArmOut(
        slice = slice,
        effects = listOf(Effect.Diag(now, r.reason)),
        notices = listOf(Notice.Refused(now, r.tool, r.reason)),
    )
