// ── blocks/escalation/contract — the block's transport ─────────────────────
// The gated slice: a REQUEST is reversible, a CONFIRM is not. Both are ordinary
// verbs with ordinary Command cases; the difference lives in the Verb table's
// reversibility classification and in the boundary gate, not in a second mechanic.

package adr.contract

import adr.spine.pure.CommandId
import adr.spine.pure.EffectClass
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName

/**
 * A sealed CLASS extending the sealed CLASS ToolResult: `tool` is passed up the chain,
 * so every variant carries it by construction rather than by re-implementing it.
 */
sealed class EscalationResult(
    override val tool: ToolName,
    /**
     * G12 one level down: a BLOCK's sub-union declares its own shared property on its own
     * parent — IN THE CONSTRUCTOR, as `open val`, so the parent actually holds it. Every
     * escalation verb is about a ticket, so every variant carries one by construction,
     * and the block's fold arm never has to ask which case it has just to find out which
     * ticket it is talking about.
     */
    open val ticket: TicketId,
) : ToolResult(tool) {

    data class RequestEscalation(
        override val tool: ToolName,
        override val ticket: TicketId,
    ) : EscalationResult(tool, ticket)

    data class ConfirmEscalation(
        override val tool: ToolName,
        override val ticket: TicketId,
    ) : EscalationResult(tool, ticket)
}

/**
 * A sealed CLASS extending the sealed CLASS Command: tool/sig/id pass up the chain and
 * every variant carries authorship, permission and identity by construction (G12).
 */
sealed class EscalationCommand(
    override val tool: ToolName,
    override val sig: Signature,
    override val id: CommandId,
) : Command(tool, sig, id) {
    data class RequestEscalation(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val ticket: TicketId,
    ) : EscalationCommand(tool, sig, id)

    data class ConfirmEscalation(
        override val tool: ToolName,
        override val sig: Signature,
        override val id: CommandId,
        val ticket: TicketId,
    ) : EscalationCommand(tool, sig, id)
}

sealed class EscalationEffect(
    override val at: Timestamp,
    effectClass: EffectClass,
) : Effect(at, effectClass) {
    /**
     * IRREVERSIBLE. Fires only inside the confirm arm's success branch — a human is
     * woken — so the class is fixed in the SUPERCLASS CALL below rather than in this
     * leaf's own constructor: no arm has an argument to launder it with, and
     * `copy()` covers only `(at, ticket)` (docs/DECISIONS.md:85). Gate check C17
     * denies constructing this leaf anywhere but the escalation arm.
     */
    data class PageOncall(
        override val at: Timestamp,
        val ticket: TicketId,
    ) : EscalationEffect(at, EffectClass.Irreversible)
}
