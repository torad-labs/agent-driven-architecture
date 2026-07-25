// ── test/spine/gate — F2 and F3, the two halves of the gate ───────────────
//
// F2 OLD (measured): onStepFinish({actor:"Agent", results:[{kind:"EscalationConfirmed",
//   ticket:"4118", by:"Human"}]}) → performed [{"kind":"PageOncall","ticket":"4118","at":9}],
//   committed [{"kind":"ConfirmEscalation","by":"Agent","id":"c1",…}], status Escalated.
//   A tool copied an Actor into its own payload; the gate branched on THAT, while the
//   log recorded the boundary's stamp. Two unreconciled values.
//
// F3: of the four confirmers 14.3 names, two were structurally blocked, one was a
//   human (contradicting the premise) and one was deny-on-timeout. All four are
//   reachable here, and none of them writes a second bus or needs recall to confer
//   authority.

package adr.spine

import adr.agent
import adr.app.ConfirmingAuthorities
import adr.app.RunAuthority
import adr.app.World
import adr.app.offlineEnv
import adr.app.wireApp
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.blocks.escalation.TicketStatus
import adr.contract.EscalationEffect
import adr.contract.ToolResult
import adr.human
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.Signature
import adr.spine.pure.TicketId
import adr.under
import kotlin.reflect.KClass
import kotlin.reflect.full.primaryConstructor
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class GateTest {

    private val ticket = TicketId("4118")

    @Test
    fun `F2 - a forged actor in the TOOL INPUT cannot reach the irreversible effect`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = world, authority = authority))

        app.agent(REQUEST_ESCALATION, "ticket" to "4118")

        // The exact shape of the measured bug: the caller claims to be a Human, in
        // the payload, on the action that pages on-call. The old port's gate read
        // `r.by` — an Actor the TOOL had copied into its own result — so a claim
        // like this one WAS the check. Here the claim has nowhere to land: decode
        // reads `ticket` and nothing else, and ToolResult has no field for it.
        app.agent(CONFIRM_ESCALATION, "ticket" to "4118", "by" to "Human", "actor" to "Human")

        assertEquals(0, world.pages.size, "measured OLD: PageOncall fired at:9")
        assertTrue(app.performed.none { it.effect is EscalationEffect.PageOncall })

        val record = app.bus.records().last()
        val refused = assertIs<ToolResult.Refused>(record.results.last())
        assertTrue(refused.reason.startsWith("self-confirm"))

        // The forged field is not in the committed result, and the stamp on the
        // committed Command is the boundary's — Agent, truthfully, not the Human
        // the input claimed.
        assertEquals(
            ToolResult.Refused(
                CONFIRM_ESCALATION,
                "self-confirm: the confirming authority is the requesting authority",
            ),
            record.results.last(),
        )
        assertEquals(Actor.Agent, record.commands.last().sig.by)
        assertIs<TicketStatus.Escalating>(app.state.escalation.statusOf(ticket))
    }

    @Test
    fun `F2 D4 - no ToolResult case can even DECLARE an Actor, Authority or Signature`() {
        // The type-level half. The runtime half above shows a forged actor being
        // ignored; this one shows there is no field to forge into, in any case that
        // exists or will exist — which is what "unrepresentable, not merely unused"
        // means (D4). Adding `by: Actor` to any variant fails HERE, not in review.
        val stamps = setOf(Actor::class, Authority::class, Signature::class)

        fun leaves(type: KClass<*>): List<KClass<*>> =
            if (type.sealedSubclasses.isEmpty()) listOf(type) else type.sealedSubclasses.flatMap { leaves(it) }

        val cases = leaves(ToolResult::class)
        assertEquals(14, cases.size, "twelve block verbs plus the spine's Unhandled and Refused")

        cases.forEach { case ->
            val offenders = case.primaryConstructor
                ?.parameters
                .orEmpty()
                .filter { it.type.classifier in stamps }
                .map { "${it.name}: ${it.type}" }
            assertEquals(emptyList(), offenders, "${case.simpleName} declares a stamp field")
        }
    }

    @Test
    fun `F2 - the CONFIRMING authority must differ from the one recorded as requester`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = world, authority = authority))

        app.agent(REQUEST_ESCALATION, "ticket" to "4118")
        val requester = assertIs<TicketStatus.Escalating>(app.state.escalation.statusOf(ticket)).requestedBy

        // Same principal: refused, whatever Actor it wears. The comparison is
        // 14.3's "a different actor than the one that issued the Request",
        // implemented as a different PRINCIPAL — `by == Human` implements "a human",
        // which is a different sentence and the one the shipped port wrote.
        app.under(authority, requester.id) { human(CONFIRM_ESCALATION, "ticket" to "4118") }
        assertIs<ToolResult.Refused>(app.bus.records().last().results.last())
        assertEquals(0, world.pages.size)

        // Different principal, SAME Actor as the requester: granted.
        app.under(authority, "policy-tier-v3") { agent(CONFIRM_ESCALATION, "ticket" to "4118") }
        val confirmed = assertIs<TicketStatus.Escalated>(app.state.escalation.statusOf(ticket))
        assertEquals(1, world.pages.size)
        assertTrue(confirmed.confirmedBy != requester, "the confirmer is a different principal")
        assertEquals(Signature(Actor.Agent, Authority("policy-tier-v3")), app.bus.records().last().commands.last().sig)
    }

    @Test
    fun `F2 - an agent cannot self-confirm, and the Actor is still stamped truthfully`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = world, authority = authority))

        app.agent(REQUEST_ESCALATION, "ticket" to "4118")
        app.agent(CONFIRM_ESCALATION, "ticket" to "4118")

        assertTrue(app.performed.none { it.effect is EscalationEffect.PageOncall })
        assertEquals(0, world.pages.size)

        val record = app.bus.records().last()
        assertIs<ToolResult.Refused>(record.results.last())
        assertEquals(Actor.Agent, record.commands.last().sig.by, "stamped truthfully")
        assertIs<TicketStatus.Escalating>(app.state.escalation.statusOf(ticket), "unchanged")
        assertEquals("ok", app.controller.view.root.banner, "a refusal is per-item, not session-global")
    }

    @Test
    fun `F3 - an unattended confirmer promotes - the Actor is Agent, only the Authority differs`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = world, authority = authority))

        app.agent(REQUEST_ESCALATION, "ticket" to "4118")
        assertEquals(
            Authority("agent-run-7f"),
            (app.state.escalation.statusOf(ticket) as TicketStatus.Escalating).requestedBy,
        )

        app.under(authority, "policy-tier-v3") { agent(CONFIRM_ESCALATION, "ticket" to "4118") }

        assertTrue(app.performed.any { it.effect is EscalationEffect.PageOncall })
        assertEquals(1, world.pages.size)
        assertEquals(
            Signature(Actor.Agent, Authority("policy-tier-v3")),
            app.bus.records().last().commands.last().sig,
        )
    }

    @Test
    fun `F3 - a human host confirms too - the mechanism is the same one`() {
        val world = World()
        val app = wireApp(offlineEnv(world = world, authority = RunAuthority()))

        app.agent(REQUEST_ESCALATION, "ticket" to "4118")
        app.human(CONFIRM_ESCALATION, "ticket" to "4118")

        assertEquals(1, world.pages.size)
        assertEquals(
            Signature(Actor.Human, Authority("host:marcos")),
            app.bus.records().last().commands.last().sig,
        )
    }

    @Test
    fun `the gate refuses a confirm with NO pending request - before the fold sees it`() {
        val world = World()
        val app = wireApp(offlineEnv(world = world))

        app.human(CONFIRM_ESCALATION, "ticket" to "4118")

        assertEquals(
            ToolResult.Refused(CONFIRM_ESCALATION, "no pending request"),
            app.bus.records().last().results.last(),
        )
        assertEquals(0, world.pages.size)
        assertIs<TicketStatus.Open>(app.state.escalation.statusOf(ticket))
        assertEquals("ok", app.controller.view.root.banner)
    }

    @Test
    fun `the product policy seam can deny an otherwise-different authority`() {
        val world = World()
        val authority = RunAuthority()
        val app = wireApp(
            offlineEnv(
                world = world,
                authority = authority,
                policy = ConfirmingAuthorities(allowed = setOf(Authority("host:marcos"))),
            ),
        )

        app.agent(REQUEST_ESCALATION, "ticket" to "4118")
        app.under(authority, "policy-tier-v3") { agent(CONFIRM_ESCALATION, "ticket" to "4118") }

        assertEquals(
            ToolResult.Refused(CONFIRM_ESCALATION, "authority may not confirm this action"),
            app.bus.records().last().results.last(),
        )
        assertEquals(0, world.pages.size)
    }

    @Test
    fun `a refusal re-folds without re-running the authorization check (G9)`() {
        val authority = RunAuthority()
        val app = wireApp(offlineEnv(world = World(), authority = authority))
        app.agent(REQUEST_ESCALATION, "ticket" to "4118")
        app.agent(CONFIRM_ESCALATION, "ticket" to "4118")

        // The committed result IS the verdict; nothing downstream has to ask again.
        val committed = app.bus.records().last().results.last()
        assertIs<ToolResult.Refused>(committed)
        assertTrue(committed.reason.startsWith("self-confirm"))
    }
}
