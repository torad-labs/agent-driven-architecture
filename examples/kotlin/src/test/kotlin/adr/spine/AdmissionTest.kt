// ── test/spine/admission — the refusal is a property of the DERIVATION ────
//
// docs/DECISIONS.md:85 says the boundary refuses an irreversible effect before
// perform. Written ONLY at the boundary that is a property of the LIVE path, and a
// re-fold derives its own effect sequence from the committed results — so a draft
// that admitted only at the boundary refused the page and then PAGED ON-CALL from
// `collectPerform(..., RECOVERY)`. Every probe below drives a session in which the
// refusal actually fires, then asserts that the live sink, `refold`,
// `collectPerform` in RECOVERY and `refoldFrom` all agree.
//
// THE PROBE HAS TO BE BUILT, and that is a MEASUREMENT of the shipped reference
// rather than a weakness of the rule. Two verbs are registered Irreversible
// (confirmEscalation, confirmSeal), the two Irreversible-class effects (PageOncall,
// DeliverArtifact) are emitted only from their own arms, and gate check C17 now
// DENIES constructing either one anywhere else in production — so admission refuses
// NOTHING on the shipped app. A probe whose session never produces a refused effect
// passes every arrangement of the code and proves nothing, so the rig below installs
// a fold that DOES the wrong thing.
//
// TWO ROGUE ATTRIBUTIONS, for the two clauses of the rule:
//   · a page attributed to a SURVIVING `setPriority` — a Reversible verb has no
//     licence, and its neighbour's licence is not transferable (PER EFFECT);
//   · a page attributed to a GATE-REFUSED `confirmEscalation` — the verb IS
//     Irreversible and the result did NOT survive, which is the headline failure
//     and the one clause no other probe can see.
//
// This file constructs `EscalationEffect.PageOncall` deliberately, which is exactly
// the shape C17 denies. It is legal here and only here because C17's census reads
// `liveTree()` — `src/main/kotlin/adr` — and a test tree is not production.

package adr.spine

import adr.app.Assembly
import adr.app.Env
import adr.app.RunAuthority
import adr.app.State
import adr.app.Wiring
import adr.app.World
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.blocks.triage.SET_PRIORITY
import adr.contract.Effect
import adr.contract.EscalationEffect
import adr.contract.ToolResult
import adr.spine.boundary.Boundary
import adr.spine.boundary.DedupingSink
import adr.spine.boundary.FinishedStep
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.Attributed
import adr.spine.pure.Authority
import adr.spine.pure.PerformMode
import adr.spine.pure.RawInput
import adr.spine.pure.REFUSED_EFFECT
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.replay.Recovery
import adr.spine.replay.Replay
import adr.spine.replay.Resume
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** The ticket the rogue arm pages about — deliberately NOT the one any confirm in
 *  the session names, so "an unrelated ticket" is checkable rather than rhetorical. */
private const val UNRELATED = "9999"

/**
 * A fold that emits an Irreversible-class effect off results that did not earn one.
 * Both wrong shapes, in one rig, keyed on different results so a probe can drive
 * either in isolation.
 */
class RogueFold {

    private val inner = Assembly()

    fun fold(
        state: State,
        results: List<ToolResult>,
        now: Timestamp,
        sig: Signature,
    ): Pair<State, List<Attributed>> {
        val (next, produced) = inner.fold(state, results, now, sig)
        val extra = mutableListOf<Attributed>()
        // (1) a SURVIVING result of a REVERSIBLE verb — no licence at all
        results.firstOrNull { it.tool == SET_PRIORITY && it !is ToolResult.Refused }?.let {
            extra += Attributed(it, EscalationEffect.PageOncall(now, TicketId(UNRELATED)))
        }
        // (2) a GATE-REFUSED result of an IRREVERSIBLE verb — the licence exists, the
        //     result did not survive. The survival clause's only witness.
        results.filterIsInstance<ToolResult.Refused>()
            .firstOrNull { it.tool == CONFIRM_ESCALATION }
            ?.let { extra += Attributed(it, EscalationEffect.PageOncall(now, TicketId("4118"))) }
        return next to (produced + extra)
    }
}

/** A live boundary driven by [RogueFold], sharing the app's registry, bus and sink. */
class RogueRig {

    val world = World()
    val authority = RunAuthority()
    private val env = Env(world = world, authority = authority)
    val app = Wiring().wireApp(env)
    private val rogue = RogueFold()
    val boundary = Boundary(
        clock = env.clock,
        ids = env.ids,
        bus = env.bus,
        sink = app.sink,
        authority = env.authority,
        policy = env.policy,
        registry = app.registry,
        fold = rogue::fold,
        projectContext = Assembly()::context,
        promptVersion = env.promptVersion,
        session = env.session,
        initial = app.initial,
    )

    fun replay(): Replay<State> = Replay(rogue::fold, app.admission)

    fun step(vararg actions: Action) {
        boundary.onStepFinish(
            FinishedStep(by = Actor.Human, staged = emptyList(), actions = actions.toList()),
        )
    }

    fun under(principal: String, body: () -> Unit) {
        authority.acting = Authority(principal)
        body()
        authority.acting = null
    }

    fun kinds(): List<String> = app.performed.map { it.effect::class.simpleName.orEmpty() }
}

class AdmissionTest {

    private fun setPriority() =
        Action(SET_PRIORITY, RawInput("ticket" to "4118", "level" to "High"))

    private fun request() = Action(REQUEST_ESCALATION, RawInput("ticket" to "4118"))

    private fun confirm() = Action(CONFIRM_ESCALATION, RawInput("ticket" to "4118"))

    @Test
    fun `the boundary REFUSES an irreversible effect no irreversible verb earned`() {
        val rig = RogueRig()
        rig.step(setPriority())

        // SUBSTITUTE, NEVER DROP: the length is what the fold produced, so the
        // (step, index) key derivation is untouched (G9).
        assertEquals(listOf("LogDecision", "Diag"), rig.kinds())
        assertTrue(
            (rig.app.performed.last().effect as Effect.Diag).note.startsWith(REFUSED_EFFECT),
        )
        assertEquals(0, rig.world.pages.size, "the world was not paged")
    }

    @Test
    fun `the licence is PER EFFECT - a surviving Irreversible verb licenses nothing else`() {
        val rig = RogueRig()
        rig.step(request())
        rig.under("policy-tier-v3") {
            // ONE step, TWO results: an Irreversible verb that survives the gate, and a
            // Reversible one whose arm emits an irreversible effect for another ticket.
            rig.step(confirm(), setPriority())
        }

        assertEquals(listOf("PageOncall", "LogDecision", "Diag"), rig.kinds())
        assertEquals(1, rig.world.pages.size)
        assertTrue(rig.world.pages.none { UNRELATED in it }, "an unrelated ticket was paged")
        assertTrue(rig.world.pages.all { "4118" in it })
    }

    @Test
    fun `A GATE-REFUSED IRREVERSIBLE VERB EARNS NOTHING - the survival clause's own probe`() {
        // The verb IS `confirmEscalation`, which the registry classifies Irreversible,
        // so the licence set contains its name. What it does NOT have is a surviving
        // result: requesting and confirming as the SAME principal is a self-confirm and
        // the gate commits `Refused`. An arm that emitted a page off the back of that
        // verdict would be performing exactly what the gate denied.
        val rig = RogueRig()
        rig.step(request())
        rig.step(confirm()) // same principal → refused at the gate

        val committed = rig.app.bus.records().flatMap { it.results }
        assertTrue(
            committed.any { it is ToolResult.Refused && it.tool == CONFIRM_ESCALATION },
            "the session must actually commit a refused confirm, or this probe is vacuous",
        )

        assertEquals(listOf("Diag", "Diag"), rig.kinds())
        assertEquals(0, rig.app.performed.count { it.effect is EscalationEffect.PageOncall })
        assertEquals(0, rig.world.pages.size)

        // …and the re-derivation agrees, key for key.
        assertEquals(
            rig.app.performed,
            rig.replay().refold(rig.app.initial, rig.app.bus.records()).effects,
        )
        val sink = DedupingSink()
        rig.replay().collectPerform(
            rig.app.initial,
            rig.app.bus.records(),
            sink,
            PerformMode.RECOVERY,
        )
        assertEquals(0, sink.fired.count { it is EscalationEffect.PageOncall })
    }

    @Test
    fun `refold re-derives the refusal, key for key`() {
        val rig = RogueRig()
        rig.step(setPriority())

        val outcome = rig.replay().refold(rig.app.initial, rig.app.bus.records())
        assertEquals(rig.app.performed, outcome.effects)
        assertEquals(rig.boundary.state, outcome.state)
    }

    @Test
    fun `RECOVERY re-drives the timeline and does NOT page what the boundary refused`() {
        // THE PINNED ACCEPTANCE. Against a draft that admitted only at the boundary,
        // this probe fired `9999` on the recovery path with the whole suite green.
        val rig = RogueRig()
        rig.step(setPriority())
        assertEquals(0, rig.world.pages.size)

        val sink = DedupingSink()
        rig.replay()
            .collectPerform(rig.app.initial, rig.app.bus.records(), sink, PerformMode.RECOVERY)
        rig.replay()
            .collectPerform(rig.app.initial, rig.app.bus.records(), sink, PerformMode.RECOVERY)

        assertEquals(0, sink.fired.count { it is EscalationEffect.PageOncall })
        assertEquals(rig.app.performed.map { it.effect }, sink.fired)
    }

    @Test
    fun `a SNAPSHOT RESUME re-derives it too - refoldFrom folds its own loop`() {
        // `refoldFrom` does not call `refold`; it re-implements the loop over a tail.
        // Deleting admission from THAT loop alone leaves every probe above green.
        val rig = RogueRig()
        rig.step(setPriority())
        rig.step(setPriority())

        val records = rig.app.bus.records()
        val replay = rig.replay()
        val snapshot = replay.snapshotAt(rig.app.initial, records, 1, "triage-fold@1")
        val resumed = replay.refoldFrom(snapshot, Recovery().tailFrom(records, 1), "triage-fold@1")

        assertIs<Resume.Resumed<State>>(resumed)
        assertEquals(rig.app.performed, resumed.outcome.effects)
        assertEquals(
            listOf("LogDecision", "Diag", "LogDecision", "Diag"),
            resumed.outcome.effects.map { it.effect::class.simpleName },
        )
    }

    @Test
    fun `the compliant shape is untouched - an earned page is performed, live and on replay`() {
        val rig = RogueRig()
        rig.step(request())
        rig.under("policy-tier-v3") { rig.step(confirm()) }

        assertEquals(listOf("PageOncall"), rig.kinds())
        assertEquals(1, rig.world.pages.size)
        assertTrue(rig.world.pages.all { "4118" in it })
        assertEquals(
            rig.app.performed,
            rig.replay().refold(rig.app.initial, rig.app.bus.records()).effects,
        )
    }
}
