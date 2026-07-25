// ── spine/pure/ids — the value vocabulary every seam speaks ─────────────────
// ZERO I/O, zero behaviour. These are the names the sealed transport hierarchies
// are built out of, so a String can never be mistaken for a tool name and an
// index can never be mistaken for a timestamp.
//
// Why the ticket/panel ids live in the SPINE and not in a block: three blocks
// (triage, escalation, console) each hold a slice keyed by TicketId, and L1
// forbids a block naming a sibling. A shared opaque id type is the only legal
// home for a vocabulary two blocks must both be able to spell. It carries no
// domain logic — that stays in the owning block.

package adr.spine.pure


/** ONE NAME PER VERB (D3): the discriminant of ToolResult, of Command, and the registry key. */
@JvmInline
value class ToolName(val value: String)

/** Minted ONLY at the boundary, from the committed sequence (G9). */
@JvmInline
value class CommandId(val value: String)

/** Read ONLY from the injected Clock, exactly once per step (G9). */
@JvmInline
value class Timestamp(val value: Long)

/** The offset the bus returned when a step was committed — the origin of every EffectKey (F7). */
@JvmInline
value class StepIndex(val value: Int)

/** The unit of work the stream is scoped to (5.2) — the only bound a folded budget may claim (F13). */
@JvmInline
value class SessionId(val value: String)

/** An opaque support-ticket identifier. */
@JvmInline
value class TicketId(val value: String)

/** An opaque console-panel identifier. */
@JvmInline
value class PanelId(val value: String)

/**
 * WHERE an off-bus input came from: a ticket stream, a sensor feed, a peer tier's
 * relay, an operator's console. It is the key conflation counts by, the scope
 * dedupe runs in, and the attribution an Interrupt or a Drain carries (12.2).
 */
@JvmInline
value class SourceName(val value: String)

/**
 * The source's OWN identifier for one work item — a queue message id, a webhook
 * delivery id. A durable policy dedupes on it; a perishable policy ignores it.
 * Never minted here: it belongs to the source, which is why it is opaque.
 */
@JvmInline
value class SourceKey(val value: String)

/** A relative duration. Never a clock reading — deadlines are handed in, not read (G9). */
typealias Millis = Long
