// ── app/demo — a runnable, offline end-to-end script (`./gradlew run`) ─────
// No API keys, no network: a scripted model drives the real agent loop, the boundary
// folds every step, the gate is shown holding and then releasing, and the work
// product is sealed and delivered exactly once.
//
// A CONSTRUCTED TYPE, not a file of top-level functions, and it holds no entry-point
// privileges: `fun main` and the one `println` live in app/Main.kt. This file blocks
// on nothing and writes to nothing — narration goes out through [Narrator], so a test
// can bind a list and assert on what the walkthrough SAID, which twenty scattered
// `println` calls made impossible.

package adr.app

import adr.blocks.analysis.PUBLISH_ANALYSIS
import adr.blocks.analysis.RECALL_ANALYSIS
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.blocks.artifact.CONFIRM_SEAL
import adr.blocks.artifact.RECORD_FINDING
import adr.blocks.artifact.REQUEST_SEAL
import adr.blocks.console.SET_PANEL
import adr.spine.boundary.FinishedStep
import adr.spine.concurrency.InMemoryMailbox
import adr.spine.concurrency.SerialConsumer
import adr.spine.concurrency.TurnRunner
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.InputPolicy
import adr.spine.pure.Message
import adr.spine.pure.SourceKey
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.RawInput
import ai.torad.aisdk.providers.mockLanguageModelToolThenText
import ai.torad.aisdk.providers.mockToolInput
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The walkthrough's own scope seam — named, like every other seam in the port. */
fun interface ScopedBody {
    suspend operator fun invoke(scope: kotlinx.coroutines.CoroutineScope)
}

class Demo(private val out: Narrator) {

    suspend fun run() {
        val world = World()
        val authority = RunAuthority()
        val events = ScriptedEvents(
            listOf(StagedInput.Perceived(SourceName("inbox"), "customer says the refund never arrived")),
        )
        val app = Wiring().wireApp(Env(world = world, authority = authority, events = events))

        // 1) A real agent turn, scripted offline: the agent calls setPriority.
        val model = mockLanguageModelToolThenText(
            toolName = "setPriority",
            toolInput = mockToolInput("ticket" to "4118", "level" to "High"),
            finalText = "Set #4118 to High.",
        )
        val turn = Wiring().agentLoop(app, Wiring().modelProvider(model), "You triage support tickets.").runTurn("ticket 4118 looks urgent")
        out.say("\n[agent] ran ${turn.steps} steps, said: \"${turn.text}\"")
        out.say("[view ] ${app.controller.view.triage.rows.first()}")

        // 2) A PRESENTATION verb, from the human surface. It folds AND signs, exactly like
        //    a domain verb — that is A1: one tool mechanic, not two.
        app.controller.onAction(Action(SET_PANEL, RawInput("panel" to "audit", "visible" to "true")))
        out.say("[a1   ] presentation command committed: ${app.bus.records().last().commands.last()}")

        // 3) The agent asks for an escalation (reversible; pages nobody).
        app.controller.onAction(Action(REQUEST_ESCALATION, RawInput("ticket" to "4118")))
        out.say("[state] ${app.controller.view.escalation.rows.first().state}")

        // 4) The SAME principal tries to confirm its own request — the gate REFUSES it,
        //    pre-fold, and commits the refusal so it replays.
        app.controller.onAction(Action(CONFIRM_ESCALATION, RawInput("ticket" to "4118")))
        out.say("[gate ] self-confirm → ${app.bus.records().last().results.last()}")
        out.say("[gate ] pages so far: ${world.pages.size}")

        // 5) An UNATTENDED confirmer: a policy tier, acting through the agent's own
        //    stream. The Actor is stamped truthfully; only the AUTHORITY differs (F3).
        authority.acting = Authority("policy-tier-v3")
        app.controller.onAction(Action(CONFIRM_ESCALATION, RawInput("ticket" to "4118")))
        authority.acting = null
        out.say("[gate ] policy-tier confirm → ${app.bus.records().last().results.last()}")
        out.say("[gate ] pages so far: ${world.pages.size}")

        // 6) The work product: folded lines, then ONE gated delivery at seal time (F6).
        app.controller.onAction(Action(RECORD_FINDING, RawInput("text" to "refund was never issued")))
        app.controller.onAction(Action(RECORD_FINDING, RawInput("text" to "escalated to on-call")))
        app.controller.onAction(Action(REQUEST_SEAL, RawInput()))
        authority.acting = Authority("policy-tier-v3")
        app.controller.onAction(Action(CONFIRM_SEAL, RawInput()))
        authority.acting = null

        out.say("\n[artifact] ${app.controller.view.artifact}")
        out.say("[world   ] pages=${world.pages.size} deliveries=${world.deliveries.size}")
        out.say("[banner  ] ${app.controller.view.root.banner}")
        out.say("[effects ] ${app.performed.joinToString(" · ") { "${it.key.step.value}:${it.key.index} ${it.effect::class.simpleName}" }}")
        out.say("[bus     ] ${app.bus.records().size} committed steps\n")

            tieringWalkthrough()
            bargeInWalkthrough()
    }

/**
 * THE TIERING RUNG (11). Two tiers, two buses, two sessions, ONE shared relay —
 * and neither holds a handle to the other. The deep tier publishes text; the fast
 * tier reaches it only through a bounded recall that returns text.
 */
    private suspend fun tieringWalkthrough() {
        val relayStore = adr.spine.concurrency.InMemoryRelay()

        // The DEEP tier: its registry contains publishAnalysis and nothing from triage.
        val deepWorld = World(relayStore)
        val deep = Wiring().wireApp(Env(world = deepWorld, verbs = DEEP_TIER))
        deep.controller.onAction(Action(PUBLISH_ANALYSIS, RawInput("text" to "refunds spike on gateway B")))
        out.say("[tier ] deep published: ${deepWorld.conclusions}")

        // The FAST tier: a SEPARATE app, a separate bus, wired to the same relay's READ
        // side. It may recall; `publishAnalysis` is not in its registry at all.
        val fastWorld = World(relayStore)
        val fast = Wiring().wireApp(Env(world = fastWorld, verbs = FAST_TIER, relayRead = relayStore))
        val mailbox = InMemoryMailbox()
        val consumer = Wiring().wireConsumer(
            app = fast,
            env = Env(world = fastWorld, verbs = FAST_TIER, relayRead = relayStore, mailbox = mailbox),
            runner = TurnRunner { _, ctx ->
                ctx.submit(FinishedStep(Actor.Agent, ctx.staged, listOf(Action(RECALL_ANALYSIS, RawInput()))))
            },
        )
        checkNotNull(consumer)

        mailbox.post(
            Message.Input(
                source = SourceName("tickets"),
                staged = StagedInput.Perceived(SourceName("tickets"), "ticket 4119: refund missing"),
                key = SourceKey("t-4119"),
            ),
        )
        mailbox.post(Message.Drain(SourceName("operator"), "walkthrough over"))
        consumer.run()

        out.say("[tier ] fast recalled: ${fast.controller.view.analysis.recalls}")
        out.say("[tier ] the fast tier's registry can publish: ${PUBLISH_ANALYSIS in fast.registry.keys}")
    }

/**
 * THE BARGE-IN RUNG (12). An Interrupt posted while a long turn is in flight is
 * handled BEFORE that turn would have finished — the thing 12.3's drain loop could
 * not do — and the preempted turn's already-committed step stays folded.
 */
    private suspend fun bargeInWalkthrough() = coroutineScopeDemo { scope ->
        val world = World()
        val mailbox = InMemoryMailbox()
        val env = Env(
            world = world,
            mailbox = mailbox,
            policies = listOf(InputPolicy.Perishable(SourceName("sensor"))),
        )
        val app = Wiring().wireApp(env)
        val consumer = checkNotNull(
            Wiring().wireConsumer(
                app = app,
                env = env,
                runner = TurnRunner { message, ctx ->
                    ctx.submit(
                        FinishedStep(
                            Actor.Agent,
                            ctx.staged,
                            listOf(Action(RECORD_FINDING, RawInput("text" to "step 1 of ${message.source.value}"))),
                        ),
                    )
                    // A LONG turn. The interrupt below must not wait for it.
                    delay(300)
                    ctx.submit(
                        FinishedStep(
                            Actor.Agent,
                            ctx.staged,
                            listOf(Action(RECORD_FINDING, RawInput("text" to "step 2 of ${message.source.value}"))),
                        ),
                    )
                },
            ),
        )

        val running = scope.launch { consumer.run() }
        mailbox.post(
            Message.Input(
                SourceName("sensor"),
                StagedInput.Perceived(SourceName("sensor"), "reading A"),
                SourceKey("a"),
            ),
        )
        delay(30)
        mailbox.post(Message.Interrupt(SourceName("operator"), "stop and answer me"))
        delay(30)
        mailbox.post(Message.Drain(SourceName("operator"), "walkthrough over"))
        running.join()

        out.say("\n[barge] committed findings: ${app.controller.view.artifact.lines}")
        out.say("[barge] settled turns: ${consumer.settled}")
        out.say("[barge] the preempted turn's step 1 is still folded, and its step 2 never ran.")
        out.say("[barge] inbox ledger: ${app.controller.view.inbox}\n")
    }

/** A tiny alias so the walkthrough above reads as prose rather than as scaffolding. */
    private suspend fun coroutineScopeDemo(body: ScopedBody) =
        kotlinx.coroutines.coroutineScope { body(this) }
}
