// ALLOW-TEST C1 — the same arm, pointing inward only.
// It reads its OWN slice and the spine's pure vocabulary. A sibling's slice would
// reach it as a value off the one folded State, handed in by the root — never by
// an import. This is idiomatic, not contorted: the arm is shorter than the
// violating one, because it needs less.
package adr.blocks.triage

import adr.contract.TriageResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Timestamp

fun triageArm(slice: TriageSlice, result: TriageResult, now: Timestamp): ArmOut<TriageSlice> =
    ArmOut(slice)
