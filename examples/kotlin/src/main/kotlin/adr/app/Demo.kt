// ── app/demo — a runnable, offline end-to-end script (`./gradlew run`) ─────
// No API keys, no network: a scripted model drives the real agent loop, the boundary
// folds every step, the gate is shown holding and then releasing, and the work
// product is sealed and delivered exactly once.

package adr.app

import adr.blocks.analysis.PUBLISH_ANALYSIS
import adr.blocks.analysis.RECALL_ANALYSIS
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.blocks.artifact.CONFIRM_SEAL
import adr.blocks.artifact.RECORD_FINDING
import adr.blocks.artifact.REQUEST_SEAL
import adr.blocks.console.SET_PANEL
import adr.spine.agent.runTurn
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
import adr.spine.pure.rawOf
import ai.torad.aisdk.providers.mockLanguageModelToolThenText
import ai.torad.aisdk.providers.mockToolInput
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

fun main(): Unit = runBlocking {
    val world = World()
    val authority = RunAuthority()
    val events = ScriptedEvents(
        listOf(StagedInput.Perceived(SourceName("inbox"), "customer says the refund never arrived")),
    )
    val app = wireApp(offlineEnv(world = world, authority = authority, events = events))

    // 1) A real agent turn, scripted offline: the agent calls setPriority.
    val model = mockLanguageModelToolThenText(
        toolName = "setPriority",
        toolInput = mockToolInput("ticket" to "4118", "level" to "High"),
        finalText = "Set #4118 to High.",
    )
    val turn = app.agentLoop(modelProvider(model), "You triage support tickets.").runTurn("ticket 4118 looks urgent")
    println("\n[agent] ran ${turn.steps} steps, said: \"${turn.text}\"")
    println("[view ] ${app.controller.view.triage.rows.first()}")

    // 2) A PRESENTATION verb, from the human surface. It folds AND signs, exactly like
    //    a domain verb — that is A1: one tool mechanic, not two.
    app.controller.onAction(Action(SET_PANEL, rawOf("panel" to "audit", "visible" to "true")))
    println("[a1   ] presentation command committed: ${app.bus.records().last().commands.last()}")

    // 3) The agent asks for an escalation (reversible; pages nobody).
    app.controller.onAction(Action(REQUEST_ESCALATION, rawOf("ticket" to "4118")))
    println("[state] ${app.controller.view.escalation.rows.first().state}")

    // 4) The SAME principal tries to confirm its own request — the gate REFUSES it,
    //    pre-fold, and commits the refusal so it replays.
    app.controller.onAction(Action(CONFIRM_ESCALATION, rawOf("ticket" to "4118")))
    println("[gate ] self-confirm → ${app.bus.records().last().results.last()}")
    println("[gate ] pages so far: ${world.pages.size}")

    // 5) An UNATTENDED confirmer: a policy tier, acting through the agent's own
    //    stream. The Actor is stamped truthfully; only the AUTHORITY differs (F3).
    authority.acting = Authority("policy-tier-v3")
    app.controller.onAction(Action(CONFIRM_ESCALATION, rawOf("ticket" to "4118")))
    authority.acting = null
    println("[gate ] policy-tier confirm → ${app.bus.records().last().results.last()}")
    println("[gate ] pages so far: ${world.pages.size}")

    // 6) The work product: folded lines, then ONE gated delivery at seal time (F6).
    app.controller.onAction(Action(RECORD_FINDING, rawOf("text" to "refund was never issued")))
    app.controller.onAction(Action(RECORD_FINDING, rawOf("text" to "escalated to on-call")))
    app.controller.onAction(Action(REQUEST_SEAL, rawOf()))
    authority.acting = Authority("policy-tier-v3")
    app.controller.onAction(Action(CONFIRM_SEAL, rawOf()))
    authority.acting = null

    println("\n[artifact] ${app.controller.view.artifact}")
    println("[world   ] pages=${world.pages.size} deliveries=${world.deliveries.size}")
    println("[banner  ] ${app.controller.view.root.banner}")
    println("[effects ] ${app.performed.joinToString(" · ") { "${it.key.step.value}:${it.key.index} ${it.effect::class.simpleName}" }}")
    println("[bus     ] ${app.bus.records().size} committed steps\n")

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
    val deep = wireApp(offlineEnv(world = deepWorld, verbs = DEEP_TIER))
    deep.controller.onAction(Action(PUBLISH_ANALYSIS, rawOf("text" to "refunds spike on gateway B")))
    println("[tier ] deep published: ${deepWorld.conclusions}")

    // The FAST tier: a SEPARATE app, a separate bus, wired to the same relay's READ
    // side. It may recall; `publishAnalysis` is not in its registry at all.
    val fastWorld = World(relayStore)
    val fast = wireApp(offlineEnv(world = fastWorld, verbs = FAST_TIER, relayRead = relayStore))
    val mailbox = InMemoryMailbox()
    val consumer = wireConsumer(
        app = fast,
        env = offlineEnv(world = fastWorld, verbs = FAST_TIER, relayRead = relayStore, mailbox = mailbox),
        runner = TurnRunner { _, ctx ->
            ctx.submit(FinishedStep(Actor.Agent, ctx.staged, listOf(Action(RECALL_ANALYSIS, rawOf()))))
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

    println("[tier ] fast recalled: ${fast.controller.view.analysis.recalls}")
    println("[tier ] the fast tier's registry can publish: ${PUBLISH_ANALYSIS in fast.registry.keys}")
}

/**
 * THE BARGE-IN RUNG (12). An Interrupt posted while a long turn is in flight is
 * handled BEFORE that turn would have finished — the thing 12.3's drain loop could
 * not do — and the preempted turn's already-committed step stays folded.
 */
private suspend fun bargeInWalkthrough() = coroutineScopeDemo { scope ->
    val world = World()
    val mailbox = InMemoryMailbox()
    val env = offlineEnv(
        world = world,
        mailbox = mailbox,
        policies = listOf(InputPolicy.Perishable(SourceName("sensor"))),
    )
    val app = wireApp(env)
    val consumer = checkNotNull(
        wireConsumer(
            app = app,
            env = env,
            runner = TurnRunner { message, ctx ->
                ctx.submit(
                    FinishedStep(
                        Actor.Agent,
                        ctx.staged,
                        listOf(Action(RECORD_FINDING, rawOf("text" to "step 1 of ${message.source.value}"))),
                    ),
                )
                // A LONG turn. The interrupt below must not wait for it.
                delay(300)
                ctx.submit(
                    FinishedStep(
                        Actor.Agent,
                        ctx.staged,
                        listOf(Action(RECORD_FINDING, rawOf("text" to "step 2 of ${message.source.value}"))),
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

    println("\n[barge] committed findings: ${app.controller.view.artifact.lines}")
    println("[barge] settled turns: ${consumer.settled}")
    println("[barge] the preempted turn's step 1 is still folded, and its step 2 never ran.")
    println("[barge] inbox ledger: ${app.controller.view.inbox}\n")
}

/** A tiny alias so the walkthrough above reads as prose rather than as scaffolding. */
private suspend fun coroutineScopeDemo(body: suspend (kotlinx.coroutines.CoroutineScope) -> Unit) =
    kotlinx.coroutines.coroutineScope { body(this) }
