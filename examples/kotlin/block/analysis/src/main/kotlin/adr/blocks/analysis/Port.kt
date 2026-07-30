// ── blocks/analysis/port — the WRITE half of the relay (4.6/G11) ───────────
// The relay is split BY DIRECTION, and that split is the architecture's own line:
//
//   READ   spine/ports/relay      the fast tier must BOUND it, and the `Recall` it
//                                 produces is spine transport riding StepRecord.
//   WRITE  here                   a feature's dependency, bound at the root — exactly
//                                 like OncallPort and DeliveryPort.
//
// An interface only. The concrete relay lives in spine/concurrency/in-memory and
// app/wire adapts it to this port, because the root is the only cross-layer
// importer (G7/G10). The spine therefore still names no block (gate check C15).

package adr.blocks.analysis

import adr.spine.pure.Timestamp

interface AnalysisRelay {
    /** Append one conclusion. `at` is the boundary's clock read, handed in (G9). */
    fun publish(at: Timestamp, text: String)
}
