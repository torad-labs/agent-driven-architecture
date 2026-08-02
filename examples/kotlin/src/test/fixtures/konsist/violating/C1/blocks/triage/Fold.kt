// BLOCK-TEST C1 (G4/G10) — a block reaches UP into the composition root.
// This is the shape that turns "plug it in / pull it out" into a lie: the block
// can no longer be lifted out, because it knows the whole application's State.
// §1.3 gives blocks/<X>/fold exactly three prefixes, and adr.app is not one.
package adr.blocks.triage

import adr.app.State
import adr.contract.TriageResult
import adr.spine.pure.Timestamp

fun triageArm(state: State, result: TriageResult, now: Timestamp): State = state
