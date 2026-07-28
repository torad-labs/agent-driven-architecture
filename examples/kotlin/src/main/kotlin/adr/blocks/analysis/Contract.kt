// ── blocks/analysis/contract — the tiered relay's transport (11) ───────────
// A deep tier publishes conclusions; a fast tier recalls them. Both halves are
// ORDINARY VERBS with ordinary Command cases — the tiering lives in which
// registration list a tier is wired with (app/wire's FAST_TIER / DEEP_TIER), not in
// a second mechanic.
//
// PACKAGE NOTE (G12, in Kotlin): this file sits in blocks/analysis/ but declares package
// adr.contract, because Kotlin requires every variant of a sealed hierarchy to live
// in one package. Gate check C2 compensates.
//
// HARD CONSTRAINT (G1 + 11.3): no case declares an Actor, an Authority or a
// Signature — so A RECALLED CONCLUSION CANNOT CARRY AUTHORITY. `Recall` itself
// declares only text and publishedAt. Recall confers no permission: it is
// unrepresentable, not merely unused, which is the same bar G1 cleared.

package adr.contract

import adr.spine.pure.CommandId
import adr.spine.pure.Recall
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName

/**
 * A sealed CLASS extending the sealed CLASS ToolResult: `tool` is passed up the chain,
 * so every variant carries it by construction rather than by re-implementing it.
 */
sealed class AnalysisResult(override val tool: ToolName) : ToolResult(tool) {
    /**
     * The FAST tier's read. It returns the `Recalled` snapshot the consumer already
     * staged and bounded — it never reaches the relay itself, so a tool body stays
     * pure and a re-fold resolves the same snapshot from committed bytes alone.
     */
    data class RecallAnalysis(
        override val tool: ToolName,
        val recall: Recall,
    ) : AnalysisResult(tool)

    /** The DEEP tier's write. Its conclusion leaves as an effect descriptor, not a call. */
    data class PublishAnalysis(
        override val tool: ToolName,
        val text: String,
    ) : AnalysisResult(tool)
}

/**
 * A sealed CLASS extending the sealed CLASS Command: tool/sig/id pass up the chain and
 * every variant carries authorship, permission and identity by construction (G12).
 */
sealed class AnalysisCommand(
    override val tool: ToolName,
    override val sig: Signature,
    override val id: CommandId,
) : Command(tool, sig, id) {
    data class RecallAnalysis(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val recall: Recall,
    ) : AnalysisCommand(tool, sig, id)

    data class PublishAnalysis(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val text: String,
    ) : AnalysisCommand(tool, sig, id)
}

sealed class AnalysisEffect(override val at: Timestamp) : Effect(at) {
    /**
     * The deep tier's own signed act. Emitted ONLY by the publish arm, so recalled
     * content cannot even reach the relay — let alone an irreversible effect.
     *
     * Being an effect descriptor (14.2) buys the whole recovery story for free: it is
     * replay-stubbed in REPLAY mode and idempotency-keyed by EffectKey in RECOVERY,
     * through machinery that already ships.
     */
    data class PublishConclusion(
        override val at: Timestamp,
        val text: String,
    ) : AnalysisEffect(at)
}
