// BLOCK-TEST C15 (G14) — the spine tier reaches DOWN into feature code.
// Three separate ways to break the vendorability claim, all in one file:
//
//   1. a block's public symbol           → the tier can no longer be lifted out whole
//   2. the composition root's State      → the tier now knows the whole application
//   3. a block's TRANSPORT symbol        → reachable ONLY because Kotlin forces every
//                                          sealed variant into one package, which is
//                                          exactly the hole C1's allow-list waves through
//
// Any one of these makes "vendor the spine once and never edit it per feature"
// false: the next feature would have to edit the tier.
package adr.spine.concurrency

import adr.app.State
import adr.blocks.triage.Triage
import adr.contract.TriageResult
import adr.spine.pure.ToolName

fun consume(state: State, result: TriageResult, name: ToolName): String =
    "$state $result $name ${Triage.initial}"
