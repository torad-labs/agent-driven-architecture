// ── app/wire — THE SINGLE COMPOSITION ROOT (G7) ────────────────────────
// Exactly one file may know what is real and what is faked in a build. Removing it
// means a service locator, which G7 forbids.
//
// Everything that binds is here: every port→adapter binding, the effect dispatcher,
// the Boundary, the Controller, and the agent loop. Plugging a block in is its
// `register(...)` line plus its port binding plus its `performer(...)` line; pulling
// it out is the same list, subtracted, plus `rm -rf blocks/<X>/`.
//
// A NEW EFFECT KIND appended to a block's EXISTING effect union is not on that
// list any more. It costs its case in the owning block's contract and its arm in
// that block's own performer — both inside the folder — and nothing here. A block
// growing its FIRST effect kind is the one exception: one compiler-named line in
// this file's performer assembly, the "handful of appends, every one
// compiler-named" headline the decisions record ratifies for the blast-radius
// table (docs/DECISIONS.md:125). This file names exactly one effect kind,
// `Effect.Diag`, which is the spine's own and stays the root's to perform.
//
// RECEIPT, 2026-07-30, addressed to the blast-radius table the decisions record
// schedules for the book (theme 5). Three prose sites now state something this file has
// made false — wiki §6.8's bounded-change note, wiki §16's restatement of it, and
// ADR-001 §1.3 Q1's parenthetical — and all three are that later entry's to rewrite
// rather than this one's. ADR-001 §1.3 Q1 pre-authorises the deletion and gates it on
// the ADR being accepted; the ADR was ratified 2026-07-26, so only the phase order is
// holding it.
//
// THE MEASURED REPLACEMENT, stated as the set the real compiler names rather than as a
// bare zero. Appending a novel kind to an existing block's effect union costs, in this
// port: `blocks/<owner>/Contract.kt` (the case) and `blocks/<owner>/Register.kt` (the
// performer arm, compiler-named) — both inside the folder — plus
// `src/test/kotlin/adr/app/TotalityTest.kt`, the GATE's own totality ledger
// (`EffectSamples`), which is out of folder and maintained per effect case exactly as
// the TS port's verb ledger already is. So, for kinds on an existing union (a FIRST
// kind adds one performer-assembly line here): out-of-folder PRODUCTION sites (anything
// under `src/main/`) = 0, in BOTH ports, earned by the real compiler — not 0 sites
// overall. The pins that keep that honest are `gateEffectKindBlockTest` plus the
// live-tree and TEST-tree censuses in `adr.gate.GateTest`, which assert the
// out-of-folder set as an equality rather than as an absence.

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
import adr.contract.Effect
import adr.contract.ToolResult
import adr.spine.agent.AgentLoop
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
import adr.spine.pure.EffectPerformer
import adr.spine.pure.InputPolicy
import adr.spine.pure.KeyedEffect
import adr.spine.pure.Message
import adr.spine.pure.Performers
import adr.spine.pure.PerformMode
import adr.spine.pure.Registry
import adr.spine.pure.SessionId
import adr.spine.pure.Signature
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.TicketId
import adr.spine.pure.RawInput
import adr.spine.pure.RegistryBuilder
import adr.spine.replay.Recovery
import adr.spine.surface.Controller
import ai.torad.aisdk.LanguageModel

/**
 * THE SPINE-OWNED `Diag` PERFORMER, and the handler split keeps it AT THE ROOT:
 * `Diag` is the only effect case the spine declares for itself, no block owns it, and
 * performing it is the root's business exactly as performing a domain effect is the
 * owning block's.
 *
 * It doubles as the floor an ORPHANED effect is diagnosed through, so "never silent"
 * and "the root performs Diag" are ONE binding rather than two that could drift.
 */
class DiagPerformer(private val log: MutableList<String>) {

    fun perform(effect: Effect.Diag) {
        log += "diag[${effect.at.value}] ${effect.note}"
    }

    fun performer(): EffectPerformer<Effect.Diag> = EffectPerformer(
        block = "spine",
        narrow = { it as? Effect.Diag },
        perform = ::perform,
    )
}

/**
 * The perform seam, ASSEMBLED rather than branched. The root lists performers; every
 * arm lives in the block that owns the effect (see [Performers]).
 *
 * FOUR BLOCKS OF SIX contribute, and the count is a measurement rather than a
 * preference — the same call `spine/pure/Block` makes about `contextLines` (5/6) and
 * `register` (5/6). `console` and `inbox` declare no effect cases at all, so a
 * performer from either could match nothing; asking them for one would make two
 * blocks pretend to a role they do not have.
 *
 * REPLAY touches nothing — that is the mode's entire contract (14.6), and it is the
 * reason a replayed trace can be driven through the SAME sink as a live one.
 */
class AppSink(
    private val performers: Performers,
    private val diag: DiagPerformer,
) : Sink {
    override fun perform(keyed: KeyedEffect, mode: PerformMode) {
        if (mode == PerformMode.REPLAY) return
        performers.perform(keyed.effect)?.let { diag.perform(it) }
    }
}

/**
 * The product-owned authority seam (14.3, 17.1). `acting` is how a NON-HUMAN
 * confirmer reaches the gate: a policy tier, a second-agent reviewer or a deferred
 * approval queue sets it, the Command still stamps its Actor TRUTHFULLY, and only
 * the Authority differs — which is precisely what G6 asks the book to state plainly.
 */
class RunAuthority(
    private val agent: Authority = Authority("agent-run-7f"),
    private val human: Authority = Authority("host:marcos"),
    private val spine: Authority = Authority("spine:consumer"),
) : AuthorityResolver {
    var acting: Authority? = null

    /**
     * `acting` still short-circuits EVERY Actor, `Spine` included — unchanged from the
     * behaviour `Agent` already had. A test that promotes a principal promotes it for
     * whatever acts next, which is the point of a one-line override.
     */
    override fun authorityOf(by: Actor, session: SessionId): Authority = acting ?: when (by) {
        Actor.Agent -> agent
        Actor.Human -> human
        Actor.Spine -> spine
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
    /**
     * THE REDUCER VERSION (14.1) — what a snapshot's tag is checked against. App-owned
     * for the same reason [promptVersion] is: the spine is generic in its State and
     * cannot know which fold it was handed, so the only place that can name the reducer
     * is the root that assembled it. It is its OWN number, never the record envelope's
     * version and never the spine's version marker — three independent questions, three
     * independent answers. Bump it when a fold arm changes what it derives, and every
     * snapshot taken under the old one is refused instead of trusted.
     */
    val reducerVersion: String = "triage-fold@1",
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
) {
    /**
     * A fully offline environment: no keys, no network, a moving clock, a fake world.
     *
     * Was a top-level `offlineEnv(...)` factory beside this class. All it ever did was
     * default an Env and derive three ports from one World — which is a constructor's
     * job, so it is one. Nothing extra needs to exist to build an Env now.
     */
    constructor(
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
    ) : this(
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
}

class App(
    val boundary: Boundary<State>,
    val controller: Controller<AppView>,
    val registry: Registry<State>,
    val bus: Bus,
    val sink: RecordingSink,
    val log: List<String>,
    val initial: State,
    val events: EventSource,
    /**
     * Published so a resume site READS the root's version instead of minting its own.
     * A copy corrupted here would leave every reader green.
     */
    val reducerVersion: String,
) {
    val state: State get() = boundary.state
    val performed: List<KeyedEffect> get() = sink.performed
}

/**
 * G7/G11: the six registrations. Each block is CONSTRUCTED here and handed a LENS onto
 * its own slice, so it never has to know what else is in State (G11).
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

/**
 * THE COMPOSITION ROOT, as a constructed type.
 *
 * These eight were top-level functions, and the argument that they were fine there is
 * the one the rule pack already answers: `fun main` is excluded from
 * no-loose-top-level-fun because a JVM entry point has nowhere else to live, and that
 * carve-out is scoped to one identifier by regex when the pack's own `ignores:` could
 * have exempted the whole folder and deliberately did not. The root's HELPERS are not
 * the entry point. They assemble a graph, they make decisions (which prompt, which
 * action), and a decision with no instance behind it cannot be exercised on its own.
 *
 * Constructed, never bound: nothing injects a Wiring. It is the one place allowed to
 * know both the spine's closed set and a block's, which is exactly why it must not be
 * substitutable — a swapped root is a different application.
 */
class Wiring {

    /** The cognition seam, bound. The spine never names the runtime's model type; this does. */
    fun modelProvider(model: LanguageModel): ModelProvider<LanguageModel> =
        object : ModelProvider<LanguageModel> {
            override fun model(): LanguageModel = model
        }
    /**
     * THE DISPATCHER ASSEMBLY. Its own member because it is the thing under test: gate
     * check C13's handler half runs the SAME assembly the app runs — once whole, once
     * with one performer deliberately withheld, and once per performer to prove each
     * claims EXACTLY its own leaves.
     *
     * It sits BESIDE the verb registry rather than on [BlockRegistration], and the
     * reason is tier independence: handler totality must hold whatever tier is wired,
     * and hanging performers off a registration would make a two-of-six [DEEP_TIER]
     * app ship a partial handler set — i.e. it would make the totality rule
     * unstateable. `EffectTotalityTest` asserts that, with the tier proven reduced.
     */
    fun effectPerformers(env: Env, log: MutableList<String>): Performers = Performers(
        listOf(
            TriageBlock().performer { log += it },
            EscalationBlock().performer(env.oncall),
            ArtifactBlock().performer(env.delivery),
            AnalysisBlock().performer(env.relay),
            DiagPerformer(log).performer(),
        ),
    )

    fun wireApp(env: Env): App {
        val registry = RegistryBuilder<State>().of(*(env.verbs ?: ALL_BLOCKS).toTypedArray())

        val log = mutableListOf<String>()
        val sink = RecordingSink(AppSink(effectPerformers(env, log), DiagPerformer(log)))
        val initial = Assembly().initialState(env.tickets)

        val boundary = Boundary(
            clock = env.clock,
            ids = env.ids,
            bus = env.bus,
            sink = sink,
            authority = env.authority,
            policy = env.policy,
            registry = registry,
            fold = Assembly()::fold,
            projectContext = Assembly()::context,
            promptVersion = env.promptVersion,
            session = env.session,
            initial = initial,
        )

        val controller = Controller(
            viewOf = { Assembly().view(boundary.state) },
            submit = boundary::onStepFinish,
        )

        return App(
            boundary, controller, registry, env.bus, sink, log, initial, env.events,
            env.reducerVersion,
        )
    }
    /** G3: the verb table meets the runtime. The loop is the only file that converts. */
    fun agentLoop(
        app: App,
        models: ModelProvider<LanguageModel>,
        instructions: String,
    ): AgentLoop<State> = AgentLoop(
        model = models.model(),
        instructions = instructions,
        registry = app.registry,
        stateOf = { app.boundary.state },
        contextOf = { app.boundary.context() },
        stagedOf = { listOfNotNull(app.events.poll()) },
        submit = app.boundary::onStepFinish,
    )
    // ── the barge-in rung, wired (12) ──────────────────────────────────────────
    // The consumer reports SPINE-shaped events; the inbox block owns an app-shaped
    // closed set of its own; and THIS FILE is the one place allowed to know both. That
    // is G11 in one function: the spine does not name the block, the block does not name
    // the consumer, and the two closed sets are joined at the root.
    //
    // The mapping produces ACTIONS, so a barge-in decision travels the ONE existing path
    // — resolveAction → gate → fold → commit → signed Command. Nothing new is added to
    // the boundary, and RunStatus is untouched.

    fun consumerActions(event: ConsumerEvent): List<Action> = when (event) {
        is ConsumerEvent.Conflated -> listOf(
            Action(
                NOTE_DROP,
                RawInput(
                    "source" to event.source.value,
                    "reason" to "Conflated",
                    "dropped" to event.dropped.toString(),
                ),
            ),
        )

        is ConsumerEvent.Duplicate -> listOf(
            Action(
                NOTE_DROP,
                RawInput("source" to event.source.value, "reason" to "Duplicate", "dropped" to "1"),
            ),
        )

        is ConsumerEvent.TurnFailed -> listOf(
            Action(NOTE_FAULT, RawInput("source" to event.source.value, "fault" to event.fault)),
        )

        is ConsumerEvent.CancelDeadlineExceeded -> listOf(
            Action(
                NOTE_FAULT,
                RawInput(
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
     *
     * NAMED CONSEQUENCE of the spine stamp: the consumer signs its steps `Actor.Spine`,
     * so this request is recorded under `spine:consumer` rather than `agent-run-7f`. The
     * seal's `requestedBy` is now the spine, which makes the AGENT a legal confirmer of a
     * drain-requested seal where it used to be the self-confirming requester the gate
     * refused. `DRAIN SEAL - the agent may confirm a SPINE-requested seal` in MailboxTest
     * pins that verdict, so a flip back is a red test rather than a discovery.
     */
    fun drainActions(message: Message.Drain): List<Action> = listOf(Action(REQUEST_SEAL, RawInput()))
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
                // Not opt-in: the dedupe scope is ALWAYS the timeline's. On a fresh
                // bus this is the empty set for free; after a crash it is what makes
                // the durable queue's redelivery refuse work that already committed.
                recovered = Recovery().committedSourceKeys(env.bus.records()),
                relay = env.relayRead,
                recallSource = SourceName("analysis"),
            )
        }
    /**
     * G3 once more, one level up: the TurnRunner the consumer drives.
     *
     * It builds the agent loop with THIS TURN'S OWN staged inputs, so the recall the
     * consumer already bounded is exactly what the model is shown and exactly what rides
     * the committed record. `ctx::submit` and not `boundary::onStepFinish`: the turn's
     * only channel is the revocable one.
     */
    fun tierRunner(
        app: App,
        models: ModelProvider<LanguageModel>,
        instructions: String,
    ): TurnRunner = TurnRunner { message, ctx ->
        AgentLoop(
            model = models.model(),
            instructions = instructions,
            registry = app.registry,
            stateOf = { app.boundary.state },
            contextOf = { app.boundary.context(ctx.staged) },
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
}
