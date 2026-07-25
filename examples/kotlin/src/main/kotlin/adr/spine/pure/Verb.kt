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
sealed class Gating {
    /** A Reversible verb: the gate passes it through untouched. */
    data object Ungated : Gating()

    /** An Irreversible verb: it proceeds only if a DIFFERENT authority requested it. */
    data class NeedsConfirmation(val requestedBy: Authority?) : Gating()
}

/**
 * THE FOUR SEAMS OF A VERB, each a NAMED `fun interface` rather than a raw function
 * type. A raw `(RawInput) -> I?` is an anonymous, transposable seam: two of them with
 * the same shape are the same type, nothing can implement it by name, no KDoc rides
 * it, and a test double cannot be declared — only a lambda can be passed. Naming them
 * costs nothing at the call site, because `operator fun invoke` keeps `decode(input)`
 * reading exactly as it did and SAM conversion keeps `::decodeSetPriority` binding.
 */
fun interface Decode<I> {
    /** Raw input in, typed input or null out. Null is a decode failure the boundary owns. */
    operator fun invoke(input: RawInput): I?
}

fun interface Run<S, I, R : ToolResult> {
    /** The PURE tool body. Reads Ctx; returns a payload; mutates nothing (G2). */
    operator fun invoke(input: I, ctx: Ctx<S>): R
}

fun interface Sign<R : ToolResult> {
    /** The name→Command entry (6.8). Every verb signs — domain and presentation alike (A1). */
    operator fun invoke(result: R, sig: Signature, id: CommandId): Command
}

fun interface Narrow<R : ToolResult> {
    /** Narrow an erased result back to this verb's own case. Null means "not mine". */
    operator fun invoke(result: ToolResult): R?
}

fun interface RequestedBy<S> {
    /** Which authority ASKED for this, read out of committed State (14.3). */
    operator fun invoke(state: S, result: ToolResult): Authority?
}

sealed interface Verb<S, I, R : ToolResult> {
    /** The verb name — the discriminant of its ToolResult, of its Command, and the registry key (D3). */
    val name: ToolName

    /** The model-facing description. The only prose the reasoner is given about this tool. */
    val describe: String

    /** The input schema: raw input in, typed input or null out. */
    val decode: Decode<I>

    /** The PURE tool body. Reads Ctx; returns a payload; mutates nothing (G2). */
    val run: Run<S, I, R>

    /** The name→Command entry (6.8). Every verb signs — domain and presentation alike (A1). */
    val sign: Sign<R>

    /** decode ∘ run. Returns null when the input failed to decode — the boundary owns that word. */
    fun resolve(input: RawInput, ctx: Ctx<S>): ToolResult? = decode(input)?.let { run(it, ctx) }

    /**
     * What the MODEL is told about one call, so it has a payload to reason over.
     * Was an extension function; an extension is not a member, so it could never be
     * overridden and had no instance behind it. It belongs to the verb, so it lives on
     * the verb.
     *
     * The RECORDED truth is produced separately, at the boundary (§3.1, §15 risk 4);
     * this string never folds, never signs and never reaches the timeline. It stays
     * HERE and not in spine/agent/loop because it makes a decision — what to say when
     * the input did not decode — and G3 says the loop is a declaration, not a place for
     * policy. Gate check C14 denies the branch the moment it drifts back.
     */
    fun modelEcho(input: RawInput, ctx: Ctx<S>): String =
        resolve(input, ctx)?.toString() ?: DECODE_FAILED

    /**
     * Narrow an erased result back to THIS verb's own case.
     *
     * Supplied at construction, where R is concrete, so it is an ordinary CHECKED
     * `as?` against a named type — `{ it as? TriageResult.SetPriority }`. It replaces
     * the system's one unchecked cast, `sign(result as R, …)`, which the compiler could
     * not verify because the registry star-projects R away, and which therefore needed
     * a @Suppress. Nothing is suppressed now; the check is real and happens at runtime.
     */
    val narrow: Narrow<R>

    /**
     * Sign a result whose static type the registry erased.
     *
     * Null means the result did not belong to this verb, which D3 says cannot happen: a
     * result reaches this verb only because its `tool` name looked this verb up, and one
     * name means one result case. Gate check C13 re-proves that mapping mechanically for
     * every case in the system. So the null branch is unreachable by proof — and it is
     * now a branch the caller must answer for, rather than a cast the compiler was told
     * to stop checking.
     */
    fun signOf(result: ToolResult, sig: Signature, id: CommandId): Command? =
        narrow(result)?.let { sign(it, sig, id) }

    /** The verb's own answer to "must the boundary gate this?" */
    fun gating(state: S, result: ToolResult): Gating

    /** Undoable, or cheap to undo. Ungated. */
    data class Reversible<S, I, R : ToolResult>(
        override val name: ToolName,
        override val describe: String,
        override val decode: Decode<I>,
        override val run: Run<S, I, R>,
        override val sign: Sign<R>,
        override val narrow: Narrow<R>,
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
        override val decode: Decode<I>,
        override val run: Run<S, I, R>,
        override val sign: Sign<R>,
        override val narrow: Narrow<R>,
        val requestedBy: RequestedBy<S>,
    ) : Verb<S, I, R> {
        override fun gating(state: S, result: ToolResult): Gating =
            Gating.NeedsConfirmation(requestedBy(state, result))
    }
}

/** The one word the system uses when an input did not decode. Spelled once (F1). */
const val DECODE_FAILED = "input failed to decode"

/** The one closed table the boundary reads: name → verb. It supplies BOTH maps (F1). */
typealias Registry<S> = Map<ToolName, Verb<S, *, *>>

/** A block's single public contribution to the spine (I7). */
data class BlockRegistration<S>(val block: String, val verbs: List<Verb<S, *, *>>)

/**
 * The composition root's one call: registrations in, the closed registry out.
 *
 * A CONSTRUCTED type rather than a top-level function, because it makes a decision —
 * it REJECTS a duplicate tool name — and a decision with no instance behind it cannot
 * be exercised on its own. This one can: build it, hand it two registrations that
 * collide, and watch it refuse, without standing up an app.
 */
class RegistryBuilder<S> {
    fun of(vararg blocks: BlockRegistration<S>): Registry<S> = of(blocks.toList())

    fun of(blocks: List<BlockRegistration<S>>): Registry<S> {
        val verbs = blocks.flatMap { it.verbs }
        val registry = verbs.associateBy { it.name }
        check(registry.size == verbs.size) { "two blocks registered the same tool name" }
        return registry
    }
}
