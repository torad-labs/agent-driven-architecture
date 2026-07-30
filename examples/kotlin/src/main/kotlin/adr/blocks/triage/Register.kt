// ── blocks/triage/register — THE ONE PUBLIC SYMBOL (G11) ───────────────
// Everything the composition root needs from this block, bundled. Plug the block in
// by constructing it at app/wire; pull it out by deleting this folder and that line.
// Nothing outside the block reaches a triage ROLE except through this type.
//
// It is a CLASS, not an `object`. That is the whole point of this file: a loose
// `object` delegating to top-level functions hosts the same disease twice — nothing
// constructs either half, so neither can be stood up, faked or swapped, and both could
// only ever be tested through whatever called them. `TriageBlock()` is an
// instantiation, so every role below can now be exercised on its own.
//
// The constructor is EMPTY, and that is the honest result of the split rule rather
// than an oversight: `arm`, `view` and `contextLines` share no argument that is fixed
// across calls, so there is nothing to hoist. The one genuinely fixed argument in the
// block — the lens a registration is built against — belongs to blocks/triage/tools,
// and `register` hands it there.
//
// The block is generic in the app's State: it is handed a LENS onto its own slice,
// so it never has to know what else is in State (G11).

package adr.blocks.triage

import adr.contract.TriageEffect
import adr.contract.TriageResult
import adr.spine.pure.ArmOut
import adr.spine.pure.Block
import adr.spine.pure.BlockRegistration
import adr.spine.pure.EffectPerformer
import adr.spine.pure.Emit
import adr.spine.pure.Lens
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp

class TriageBlock : Block<TriageSlice, TriageResult, TriageView> {

    /**
     * The parts, built HERE rather than injected — the same call the boundary makes
     * about its own two seams. A block that could be handed a different arm would be a
     * block whose fold arm is not the one the compiler checked against this block's
     * sealed sub-union; instantiation is what the law asks for, and bindability here
     * would only widen what can go wrong.
     */
    private val armImpl = TriageArm()
    private val projection = TriageProjection()

    fun <S> register(lens: Lens<S, TriageSlice>): BlockRegistration<S> =
        BlockRegistration(block = "triage", verbs = TriageTools(lens).verbs())

    /**
     * THE EFFECT PERFORMER. Registered exactly like the verbs above, and for the same
     * reason: performing a [TriageEffect] is this block's business, and it closes
     * over the block's own line writer — bound at the root, named nowhere else.
     *
     * The `when` is over this block's OWN sealed sub-union with no else arm, so a case
     * it does not answer is a compile error HERE, in the folder that owns it. That is
     * the whole claim: a novel effect kind costs zero PRODUCTION sites outside the folder.
     */
    fun performer(emit: Emit<String>): EffectPerformer<TriageEffect> = EffectPerformer(
        block = "triage",
        narrow = { it as? TriageEffect },
        perform = { effect ->
            when (effect) {
                is TriageEffect.LogDecision -> emit(
                    "priority[${effect.at.value}] ${effect.ticket.value} -> ${effect.level}" +
                        (effect.supersedes?.let { " (was $it)" } ?: ""),
                )
            }
        },
    )

    override fun arm(
        slice: TriageSlice,
        result: TriageResult,
        now: Timestamp,
        sig: Signature,
    ): ArmOut<TriageSlice> = armImpl.arm(slice, result, now, sig)

    /**
     * The SEEDED slice. It lives on the block, not on a companion of the shape: a
     * companion member has no instance, and this one builds the block's own state, so
     * the block is where it belongs. The empty slice needs nothing at all — it is what
     * `TriageSlice()` constructs.
     */
    fun slice(tickets: List<Ticket>): TriageSlice =
        TriageSlice(tickets = tickets.associateBy { it.id })

    override fun view(slice: TriageSlice): TriageView = projection.view(slice)

    /**
     * Not on [Block]: blocks/artifact has no context lines at all, so pinning this to
     * the interface would force one of the six to fake a role it does not have.
     */
    fun contextLines(slice: TriageSlice): List<String> = projection.contextLines(slice)
}
