// ── app/wire — THE SINGLE COMPOSITION ROOT (I1, G7) ────────────────────────
// Exactly one file may know what is real and what is faked in a build. Removing it
// means a service locator, which G7 forbids.
//
// Everything that binds is here: every port→adapter binding, the effect sink, the
// Boundary, the Controller, and the agent loop. Plugging a block in is its
// `register(...)` line plus its port binding plus its sink branch; pulling it out is
// the same list, subtracted, plus `rm -rf blocks/<X>/`.

package adr.app

import adr.blocks.analysis.AnalysisBlock
import adr.blocks.analysis.AnalysisRelay
import adr.blocks.analysis.LiveRelayWriter
import adr.blocks.artifact.ArtifactBlock
import adr.blocks.artifact.DeliveryPort
import adr.blocks.artifact.LiveDelivery
import adr.blocks.artifact.REQUEST_SEAL
import adr.blocks.console.ConsoleBlock
import adr.blocks.escalation.EscalationBlock
import adr.blocks.escalation.LivePager
import adr.blocks.escalation.OncallPort
import adr.blocks.inbox.InboxBlock
import adr.blocks.inbox.NOTE_DROP
import adr.blocks.inbox.NOTE_FAULT
import adr.blocks.triage.Ticket
import adr.blocks.triage.TriageBlock
import adr.contract.AnalysisEffect
import adr.contract.ArtifactEffect
import adr.contract.Effect
import adr.contract.EscalationEffect
import adr.contract.ToolResult
import adr.contract.TriageEffect
import adr.spine.agent.AgentLoop
import adr.spine.agent.runTurn
import adr.spine.boundary.Boundary
import adr.spine.boundary.InMemoryBus
import adr.spine.boundary.MovingClock
import adr.spine.boundary.RecordingSink
import adr.spine.boundary.SequentialIds
import adr.spine.concurrency.InMemoryRelay
import adr.spine.concurrency.SerialConsumer
import adr.spine.concurrency.TurnRunner
import adr.spine.ports.AuthorityResolver
import adr.spine.ports.Bus
import adr.spine.ports.Clock
import adr.spine.ports.ConfirmPolicy
import adr.spine.ports.EventSource
import adr.spine.ports.IdSource
import adr.spine.ports.Mailbox
import adr.spine.ports.ModelProvider
import adr.spine.ports.RelayRead
import adr.spine.ports.Sink
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.BlockRegistration
import adr.spine.pure.ConsumerEvent
import adr.spine.pure.InputPolicy
import adr.spine.pure.KeyedEffect
import adr.spine.pure.Message
import adr.spine.pure.PerformMode
import adr.spine.pure.Registry
import adr.spine.pure.SessionId
import adr.spine.pure.Signature
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.TicketId
import adr.spine.pure.rawOf
import adr.spine.pure.registryOf
import adr.spine.surface.Controller
import ai.torad.aisdk.LanguageModel

/**
 * The one branch per effect kind. Exhaustive over Effect with NO else arm, so a new
 * effect kind fails to compile until it is bound to something real (§11.1).
 *
 * REPLAY touches nothing — that is the mode's entire contract (§3.6), and it is the
 * reason a replayed trace can be driven through the SAME sink as a live one.
 */
class AppSink(
    private val oncall: OncallPort,
    private val delivery: DeliveryPort,
    private val relay: AnalysisRelay,
    private val log: MutableList<String>,
) : Sink {
    override fun perform(keyed: KeyedEffect, mode: PerformMode) {
        if (mode == PerformMode.REPLAY) return
        when (val effect = keyed.effect) {
            is Effect.Diag -> log += "diag[${effect.at.value}] ${effect.note}"

            is TriageEffect -> when (effect) {
                is TriageEffect.LogDecision ->
                    log += "priority[${effect.at.value}] ${effect.ticket.value} -> ${effect.level}" +
                        (effect.supersedes?.let { " (was $it)" } ?: "")
            }

            is EscalationEffect -> when (effect) {
                is EscalationEffect.PageOncall -> oncall.page(effect.ticket)
            }

            is ArtifactEffect -> when (effect) {
                is ArtifactEffect.DeliverArtifact -> delivery.deliver(effect.lines)
            }

            // The deep tier's publish is an ORDINARY EFFECT DESCRIPTOR (14.2), which is
            // why the tiering rung inherits replay-stubbing and RECOVERY idempotency for
            // free — the early return above already stubs it in REPLAY.
            is AnalysisEffect -> when (effect) {
                is AnalysisEffect.PublishConclusion -> relay.publish(effect.at, effect.text)
            }
        }
    }
}

/**
 * The product-owned authority seam (14.3, 17.1). `acting` is how a NON-HUMAN
 * confirmer reaches the gate: a policy tier, a second-agent reviewer or a deferred
 * approval queue sets it, the Command still stamps its Actor TRUTHFULLY, and only
 * the Authority differs — which is precisely what F3 asks the book to state plainly.
 */
class RunAuthority(
    private val agent: Authority = Authority("agent-run-7f"),
    private val human: Authority = Authority("host:marcos"),
) : AuthorityResolver {
    var acting: Authority? = null

    override fun authorityOf(by: Actor, session: SessionId): Authority = acting ?: when (by) {
        Actor.Agent -> agent
        Actor.Human -> human
    }
}

/** A product rule on top of the structural self-confirm denial the gate already applies. */
class ConfirmingAuthorities(private val allowed: Set<Authority>? = null) : ConfirmPolicy {
    override fun mayConfirm(
        sig: Signature,
        result: ToolResult,
        requestedBy: Authority,
    ): Boolean = allowed == null || sig.authority in allowed
}

/** The cognition seam, bound. The spine never names the runtime's model type; this does. */
fun modelProvider(model: LanguageModel): ModelProvider<LanguageModel> =
    object : ModelProvider<LanguageModel> {
        override fun model(): LanguageModel = model
    }

/** The sensing seam, bound: a scripted queue of untrusted perceived events (10.2). */
class ScriptedEvents(private val events: List<StagedInput.Perceived> = emptyList()) : EventSource {
    private var next = 0

    override fun poll(): StagedInput.Perceived? = events.getOrNull(next++)
}

/**
 * The fake world the offline demo and every test page, deliver and publish into.
 *
 * [store] is a constructor parameter so TWO worlds — a fast tier and a deep tier —
 * can share ONE relay while sharing nothing else: separate buses, separate sessions,
 * separate models, no handle from either to the other.
 */
class World(val store: InMemoryRelay = InMemoryRelay()) {
    val pages = mutableListOf<String>()
    val deliveries = mutableListOf<String>()
    val conclusions = mutableListOf<String>()
    val oncall: OncallPort = LivePager("https://pager.example/page") { pages += it }
    val delivery: DeliveryPort = LiveDelivery { deliveries += it }
    val relay: AnalysisRelay = LiveRelayWriter { at, text ->
        conclusions += text
        store.publish(at, text)
    }
}

data class Env(
    val clock: Clock,
    val authority: AuthorityResolver,
    val oncall: OncallPort,
    val delivery: DeliveryPort,
    val relay: AnalysisRelay,
    val ids: IdSource = SequentialIds(),
    val bus: Bus = InMemoryBus(),
    val policy: ConfirmPolicy = ConfirmingAuthorities(),
    val events: EventSource = ScriptedEvents(),
    val promptVersion: String = "triage-prompt@1",
    val session: SessionId = SessionId("session-1"),
    val tickets: List<Ticket> = emptyList(),
    /**
     * 11.4's single registry, as an ALLOWLIST. Null means every block and every verb —
     * the single-process default. [FAST_TIER] / [DEEP_TIER] are the two-tier split.
     */
    val verbs: List<BlockRegistration<State>>? = null,
    /** The barge-in rung (12), OPT-IN: no mailbox, no consumer, no cost. */
    val mailbox: Mailbox? = null,
    /** The tiering rung (11), OPT-IN: the READ half. The write half is the block's port. */
    val relayRead: RelayRead? = null,
    /** Per SOURCE (12.2). An unlisted source gets DurableQueue — see spine/pure/mailbox. */
    val policies: List<InputPolicy> = emptyList(),
)

/** A fully offline environment: no keys, no network, a moving clock, a fake world. */
fun offlineEnv(
    world: World = World(),
    authority: AuthorityResolver = RunAuthority(),
    clock: Clock = MovingClock(start = 1000, step = 7),
    tickets: List<Ticket> = listOf(Ticket(TicketId("4118"), "refund not received")),
    policy: ConfirmPolicy = ConfirmingAuthorities(),
    events: EventSource = ScriptedEvents(),
    verbs: List<BlockRegistration<State>>? = null,
    mailbox: Mailbox? = null,
    relayRead: RelayRead? = null,
    policies: List<InputPolicy> = emptyList(),
): Env = Env(
    clock = clock,
    authority = authority,
    oncall = world.oncall,
    delivery = world.delivery,
    relay = world.relay,
    policy = policy,
    events = events,
    tickets = tickets,
    verbs = verbs,
    mailbox = mailbox,
    relayRead = relayRead,
    policies = policies,
)

class App(
    val boundary: Boundary<State>,
    val controller: Controller<AppView>,
    val registry: Registry<State>,
    val bus: Bus,
    val sink: RecordingSink,
    val log: List<String>,
    val initial: State,
    val events: EventSource,
) {
    val state: State get() = boundary.state
    val performed: List<KeyedEffect> get() = sink.performed
}

/**
 * I2/I7: the six registrations. Each block is CONSTRUCTED here and handed a LENS onto
 * its own slice, so it never has to know what else is in State (L1).
 *
 * This is the composition root doing what a composition root is for. A block used to be
 * a loose `object` that existed whether or not anyone wired it; now the root builds each
 * one, and a block nobody constructs is a block that is not in the system.
 *
 * Declared as `get()` rather than a stored property so no top-level initialisation
 * order exists to reason about — the same idiom every slice's `empty` uses.
 */
val ALL_BLOCKS: List<BlockRegistration<State>>
    get() = listOf(
        TriageBlock().register { it.triage },
        EscalationBlock().register { it.escalation },
        ConsoleBlock().register { it.console },
        ArtifactBlock().register { it.artifact },
        AnalysisBlock().register { it.analysis },
        InboxBlock().register { it.inbox },
    )

/**
 * 11.4's "single registry, an allowlist of the agents permitted to exist", declared
 * once at the root: the HOT LOOP may recall a peer's conclusion and may NOT publish
 * one. `publishAnalysis` is not in its registry at all, so the boundary folds an
 * `Unhandled` rather than the tier relying on a promise not to call it.
 */
val FAST_TIER: List<BlockRegistration<State>>
    get() = listOf(
        TriageBlock().register { it.triage },
        EscalationBlock().register { it.escalation },
        ConsoleBlock().register { it.console },
        ArtifactBlock().register { it.artifact },
        AnalysisBlock().registerFast { it.analysis },
        InboxBlock().register { it.inbox },
    )

/** The DEEP tier does one job: think slowly, and publish what it concluded. */
val DEEP_TIER: List<BlockRegistration<State>>
    get() = listOf(
        AnalysisBlock().registerDeep { it.analysis },
        InboxBlock().register { it.inbox },
    )

fun wireApp(env: Env): App {
    val registry = registryOf(*(env.verbs ?: ALL_BLOCKS).toTypedArray())

    val log = mutableListOf<String>()
    val sink = RecordingSink(AppSink(env.oncall, env.delivery, env.relay, log))
    val initial = initialState(env.tickets)

    val boundary = Boundary(
        clock = env.clock,
        ids = env.ids,
        bus = env.bus,
        sink = sink,
        authority = env.authority,
        policy = env.policy,
        registry = registry,
        fold = ::foldApp,
        projectContext = ::projectContextApp,
        promptVersion = env.promptVersion,
        session = env.session,
        initial = initial,
    )

    val controller = Controller(
        viewOf = { projectApp(boundary.state) },
        submit = boundary::onStepFinish,
    )

    return App(boundary, controller, registry, env.bus, sink, log, initial, env.events)
}

/** I5: the verb table meets the runtime. The loop is the only file that converts. */
fun App.agentLoop(
    models: ModelProvider<LanguageModel>,
    instructions: String,
): AgentLoop<State> = AgentLoop(
    model = models.model(),
    instructions = instructions,
    registry = registry,
    stateOf = { boundary.state },
    contextOf = { boundary.context() },
    stagedOf = { listOfNotNull(events.poll()) },
    submit = boundary::onStepFinish,
)

// ── the barge-in rung, wired (12) ──────────────────────────────────────────
// The consumer reports SPINE-shaped events; the inbox block owns an app-shaped
// closed set of its own; and THIS FILE is the one place allowed to know both. That
// is L1 in one function: the spine does not name the block, the block does not name
// the consumer, and the two closed sets are joined at the root.
//
// The mapping produces ACTIONS, so a barge-in decision travels the ONE existing path
// — resolveAction → gate → fold → commit → signed Command. Nothing new is added to
// the boundary, and RunStatus is untouched.

fun consumerActions(event: ConsumerEvent): List<Action> = when (event) {
    is ConsumerEvent.Conflated -> listOf(
        Action(
            NOTE_DROP,
            rawOf(
                "source" to event.source.value,
                "reason" to "Conflated",
                "dropped" to event.dropped.toString(),
            ),
        ),
    )

    is ConsumerEvent.Duplicate -> listOf(
        Action(
            NOTE_DROP,
            rawOf("source" to event.source.value, "reason" to "Duplicate", "dropped" to "1"),
        ),
    )

    is ConsumerEvent.TurnFailed -> listOf(
        Action(NOTE_FAULT, rawOf("source" to event.source.value, "fault" to event.fault)),
    )

    is ConsumerEvent.CancelDeadlineExceeded -> listOf(
        Action(
            NOTE_FAULT,
            rawOf(
                "source" to event.source.value,
                "fault" to "abandoned: the turn ignored cancellation for ${event.afterMs}ms",
            ),
        ),
    )
}

/**
 * What a Drain commits before the consumer stops (12.3). It REQUESTS the seal rather
 * than confirming it: `confirmSeal` is irreversible and 14.3 requires a different
 * principal, so a drain cannot rubber-stamp its own finalization. The gate is not
 * suspended because the session is ending.
 */
fun drainActions(message: Message.Drain): List<Action> = listOf(Action(REQUEST_SEAL, rawOf()))

/**
 * Build the barge-in consumer — ONLY when a mailbox was supplied. An app that takes
 * neither rung pays nothing: no mailbox, no consumer, no relay read.
 */
fun wireConsumer(app: App, env: Env, runner: TurnRunner): SerialConsumer? =
    env.mailbox?.let { mailbox ->
        SerialConsumer(
            mailbox = mailbox,
            runner = runner,
            submit = app.boundary::onStepFinish,
            report = ::consumerActions,
            finalize = ::drainActions,
            policies = env.policies,
            relay = env.relayRead,
            recallSource = SourceName("analysis"),
        )
    }

/**
 * I5 once more, one level up: the TurnRunner the consumer drives.
 *
 * It builds the agent loop with THIS TURN'S OWN staged inputs, so the recall the
 * consumer already bounded is exactly what the model is shown and exactly what rides
 * the committed record. `ctx::submit` and not `boundary::onStepFinish`: the turn's
 * only channel is the revocable one.
 */
fun App.tierRunner(
    models: ModelProvider<LanguageModel>,
    instructions: String,
): TurnRunner = TurnRunner { message, ctx ->
    AgentLoop(
        model = models.model(),
        instructions = instructions,
        registry = registry,
        stateOf = { boundary.state },
        contextOf = { boundary.context(ctx.staged) },
        stagedOf = { ctx.staged },
        submit = ctx::submit,
    ).runTurn(promptFor(message))
}

/** One prompt per kind of barge-in. Closed match, no else arm. */
fun promptFor(message: Message): String = when (message) {
    is Message.Input -> message.staged.body
    is Message.Interrupt -> "INTERRUPT: ${message.reason}"
    is Message.Drain -> "DRAIN: ${message.reason}"
}
