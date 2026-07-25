// ── spine/pure/verb — one registration, two maps, default-deny by construction ─
// A Verb is everything a block declares about one tool: its name, the description
// the model reads, the input schema, the PURE body, the name→Command entry, and
// its reversibility.
//
// 14.3's default-deny becomes structural: there is no default. You pick a variant,
// and Irreversible CANNOT BE CONSTRUCTED without saying where its matching Request
// lives. Registering a tool FORCES the classification decision, and the
// classification is a reviewed row in the registry, not a guess.
//
// A1: there is exactly ONE tool mechanic. A presentation verb (focusTicket,
// setPanel) is a Verb with the same five properties, the same signer and the same
// blast radius as a domain verb (setPriority). There is no second table.

package adr.spine.pure

import adr.contract.Command
import adr.contract.ToolResult

/**
 * What a tool may read: the committed snapshot, and the bounded projection the
 * reasoner also saw.
 *
 * NO actor. NO authority. NO Signature (F2/D4). Deleting ctx.actor is what makes an
 * Actor UNREPRESENTABLE upstream of the boundary — a tool asking "who is asking?"
 * is asking the wrong question, because the answer is stamped after it returns.
 */
data class Ctx<S>(val state: S, val context: Context)

/**
 * What the boundary gate must decide about a verb — computed by the verb itself
 * from its OWN classification, because Kotlin's generic erasure means the boundary
 * cannot `is`-check `Verb.Irreversible<S, *, *>` and still call through it.
 * The sealed pair is what the gate matches on, exhaustively.
 */
sealed interface Gating {
    /** A Reversible verb: the gate passes it through untouched. */
    data object Ungated : Gating

    /** An Irreversible verb: it proceeds only if a DIFFERENT authority requested it. */
    data class NeedsConfirmation(val requestedBy: Authority?) : Gating
}

sealed interface Verb<S, I, R : ToolResult> {
    /** The verb name — the discriminant of its ToolResult, of its Command, and the registry key (D3). */
    val name: ToolName

    /** The model-facing description. The only prose the reasoner is given about this tool. */
    val describe: String

    /** The input schema: raw input in, typed input or null out. */
    val decode: (RawInput) -> I?

    /** The PURE tool body. Reads Ctx; returns a payload; mutates nothing (G2). */
    val run: (I, Ctx<S>) -> R

    /** The name→Command entry (6.8). Every verb signs — domain and presentation alike (A1). */
    val sign: (R, Signature, CommandId) -> Command

    /** decode ∘ run. Returns null when the input failed to decode — the boundary owns that word. */
    fun resolve(input: RawInput, ctx: Ctx<S>): ToolResult? = decode(input)?.let { run(it, ctx) }

    /**
     * Sign a result whose static type has been erased by the registry's star projection.
     *
     * This is the ONE unchecked cast in the system, and D3 is its proof: a result
     * reaches this verb only because its `tool` name looked this verb up, and one
     * name means one result case. Gate check C13 re-proves that mapping mechanically
     * for every case in the system, so the cast is total by test, not by luck.
     */
    @Suppress("UNCHECKED_CAST")
    fun signOf(result: ToolResult, sig: Signature, id: CommandId): Command =
        sign(result as R, sig, id)

    /** The verb's own answer to "must the boundary gate this?" */
    fun gating(state: S, result: ToolResult): Gating

    /** Undoable, or cheap to undo. Ungated. */
    data class Reversible<S, I, R : ToolResult>(
        override val name: ToolName,
        override val describe: String,
        override val decode: (RawInput) -> I?,
        override val run: (I, Ctx<S>) -> R,
        override val sign: (R, Signature, CommandId) -> Command,
    ) : Verb<S, I, R> {
        override fun gating(state: S, result: ToolResult): Gating = Gating.Ungated
    }

    /**
     * Not undoable. Cannot be constructed without `requestedBy`: the lens that reads,
     * out of committed State, WHICH AUTHORITY asked for this — because 14.3 requires
     * the confirmation to come from a different principal than the one that asked.
     */
    data class Irreversible<S, I, R : ToolResult>(
        override val name: ToolName,
        override val describe: String,
        override val decode: (RawInput) -> I?,
        override val run: (I, Ctx<S>) -> R,
        override val sign: (R, Signature, CommandId) -> Command,
        val requestedBy: (S, ToolResult) -> Authority?,
    ) : Verb<S, I, R> {
        override fun gating(state: S, result: ToolResult): Gating =
            Gating.NeedsConfirmation(requestedBy(state, result))
    }
}

/** The one word the system uses when an input did not decode. Spelled once (F1). */
const val DECODE_FAILED = "input failed to decode"

/**
 * What the MODEL is told about one call, so it has a payload to reason over.
 *
 * The RECORDED truth is produced separately, at the boundary (§3.1, §15 risk 4);
 * this string never folds, never signs and never reaches the timeline.
 *
 * It lives HERE and not in spine/agent/loop because it makes a decision — what to
 * say when the input did not decode — and G3 says the loop is a declaration, not a
 * place for policy. Gate check C14 denies the branch the moment it drifts back into
 * the loop file, which is exactly how it got there in the first place.
 */
fun <S> Verb<S, *, *>.modelEcho(input: RawInput, ctx: Ctx<S>): String =
    resolve(input, ctx)?.toString() ?: DECODE_FAILED

/** The one closed table the boundary reads: name → verb. It supplies BOTH maps (F1). */
typealias Registry<S> = Map<ToolName, Verb<S, *, *>>

/** A block's single public contribution to the spine (I7). */
data class BlockRegistration<S>(val block: String, val verbs: List<Verb<S, *, *>>)

/** The composition root's one call: registrations in, the closed registry out. */
fun <S> registryOf(vararg blocks: BlockRegistration<S>): Registry<S> {
    val verbs = blocks.flatMap { it.verbs }
    val registry = verbs.associateBy { it.name }
    check(registry.size == verbs.size) { "two blocks registered the same tool name" }
    return registry
}
