// ── blocks/inbox/contract — the barge-in ledger's transport (12.2/12.4) ────
// Two verbs, both Reversible, both ordinary. THE POINT: a busy-drop is a decision,
// so it SIGNS — exactly like 6.8's presentation verbs. That is why the drop counter
// needs no new spine machinery and costs the core path zero: the spine's own sealed
// sets do not grow, app/assemble's spine arms do not grow, and an app that never
// wires a consumer never compiles this block.
//
// PACKAGE NOTE (G12, in Kotlin): package adr.contract, folder blocks/inbox. Gate check C2
// compensates.

package adr.contract

import adr.spine.pure.CommandId
import adr.spine.pure.Signature
import adr.spine.pure.SourceName
import adr.spine.pure.ToolName

/**
 * A sealed CLASS extending the sealed CLASS ToolResult: `tool` is passed up the chain,
 * so every variant carries it by construction rather than by re-implementing it.
 */
sealed class InboxResult(
    override val tool: ToolName,
    /**
     * G12 one level down: the block's sub-union declares its own shared property on its
     * own parent — IN THE CONSTRUCTOR, as `open val`, so the parent holds it rather than
     * merely requiring it. Every inbox verb is about a SOURCE, so the arm never has to
     * ask which case it has just to find out which source it is talking about.
     */
    open val source: SourceName,
) : ToolResult(tool) {

    /**
     * FORCED INTO THE TRANSPORT ROOT by Kotlin's sealed rule, not by preference.
     *
     * Every variant of a sealed hierarchy must live in one package AND one MODULE, so
     * this block's transport is authored inside `:spine` (ADR-001 §3) — the compiler
     * says "Extending sealed classes or interfaces from a different module is
     * prohibited". A payload type the transport NAMES therefore cannot stay behind in
     * the block module: `:spine` may not depend on a block at all.
     *
     * It is nested on the block's own sealed root rather than promoted to
     * `adr.spine.pure`, because the kernel is a VENDORABLE tier (gate check C15) and
     * an inbox drop reason is block domain vocabulary — putting it there would be a
     * worse violation of "the spine tier names nothing in your feature code" than
     * anything the DAG fixes. Nested, C2 admits it by the existing name-prefix rule
     * (`InboxResult.DropReason` starts with `Inbox`), C15 never sees it, `adr.spine.pure`
     * gains nothing, and no new file and no new package enter the kernel.
     *
     * WHAT IT IS: why an input was dropped — the block's OWN closed set, deliberately
     * not the spine's `ConsumerEvent`. The two sets are joined at the root by
     * app/wire's `report` mapping, which is G11-correct: the spine does not name the
     * block, the block does not name the consumer, and the composition root is the one
     * place allowed to know both.
     */
    enum class DropReason {
        /** Newest-input-wins superseded it while a turn was in flight (12.2). */
        Conflated,

        /** A redelivered lease whose source key had already been folded (12.2). */
        Duplicate,
        ;

        /**
         * The ONE seam from an external token to this closed set — the `fromToken()` the
         * stringly-dispatch law asks for. It replaces a `when` over string literals, which
         * is open-world dispatch: adding a variant there was a silent fall-through to
         * `else -> null` rather than a compile error. Derived from `entries`, so a new
         * variant is admitted automatically and cannot be forgotten.
         *
         * Still guarded, and still total: an unrecognised word is a decode failure (null),
         * never a default.
         */
        fun interface Parser {
            fun parse(token: String): DropReason?
        }
    }

    data class NoteDrop(
        override val tool: ToolName,
        override val source: SourceName,
        val reason: DropReason,
        val dropped: Int,
    ) : InboxResult(tool, source)

    data class NoteFault(
        override val tool: ToolName,
        override val source: SourceName,
        val fault: String,
    ) : InboxResult(tool, source)
}

/**
 * A sealed CLASS extending the sealed CLASS Command: tool/sig/id pass up the chain and
 * every variant carries authorship, permission and identity by construction (G12).
 */
sealed class InboxCommand(
    override val tool: ToolName,
    override val sig: Signature,
    override val id: CommandId,
) : Command(tool, sig, id) {
    data class NoteDrop(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val source: SourceName,
        val reason: InboxResult.DropReason,
        val dropped: Int,
    ) : InboxCommand(tool, sig, id)

    data class NoteFault(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val source: SourceName,
        val fault: String,
    ) : InboxCommand(tool, sig, id)
}
