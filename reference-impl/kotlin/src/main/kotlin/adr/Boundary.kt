// ── The boundary adapter: the one impure seam (seam 02) ─────────────────────
// The single place the pure core touches the world. It mints the clock and id,
// stamps the Actor, COMMITS to the append-only bus, adopts the new state, and
// performs effects — in that order. Nothing else in the system is impure.

package adr

// Injected capabilities — quarantined here so the core stays pure and replayable.
interface Clock {
    fun now(): Long
    companion object
}

interface IdSource {
    fun next(): String
    companion object
}

enum class PerformMode { LIVE, REPLAY }

interface Bus {
    fun append(commands: List<Command>, results: List<ToolResult>)
}

interface Sink {
    fun perform(effect: Effect, mode: PerformMode)
}

// One finished agent step: the tool results it produced, and who acted.
data class FinishedStep(val actor: Actor, val results: List<ToolResult>)

// Map a tool result to its signed command. The Actor is stamped HERE, never
// forged upstream; the id is minted HERE, never chosen by the model.
fun ToolResult.sign(by: Actor, id: String): Command = when (this) {
    is ToolResult.PrioritySet -> Command.SetPriority(by, id, ticket, level)
    is ToolResult.EscalationRequested -> Command.RequestEscalation(by, id, ticket)
    is ToolResult.EscalationConfirmed -> Command.ConfirmEscalation(by, id, ticket)
    is ToolResult.Focused -> Command.FocusTicket(by, id, ticket)
}

class Boundary(
    private val clock: Clock,
    private val ids: IdSource,
    private val bus: Bus,
    private val sink: Sink,
    initial: State,
) {
    var state: State = initial
        private set

    // The one impure method. Order is the contract: commit, then adopt, then perform.
    fun onStepFinish(step: FinishedStep) {
        val now = clock.now()                                          // (1) injected clock
        val (next, effects) = Reducer.fold(state, step.results, now)   // (2) pure decision
        val signed = step.results.map { it.sign(step.actor, ids.next()) } // (3) stamp + mint
        bus.append(signed, step.results)                              // (4) COMMIT to the append-only log
        state = next                                                  // (5) adopt the new truth
        for (fx in effects) sink.perform(fx, PerformMode.LIVE)        // (6) the only place effects run
    }
}

// ── A trivial in-memory bus + recorder, so a session can be replayed ─────────
class RecordingBus : Bus {
    val commands = mutableListOf<Command>()
    val results = mutableListOf<ToolResult>()
    override fun append(commands: List<Command>, results: List<ToolResult>) {
        this.commands += commands
        this.results += results
    }
}

// A clock/id pair that is deterministic, for tests and replay.
fun Clock.Companion.fixed(at: Long): Clock = object : Clock {
    override fun now(): Long = at
}

fun IdSource.Companion.sequential(prefix: String = "c"): IdSource = object : IdSource {
    private var n = 0
    override fun next(): String = "$prefix${++n}"
}

// Build a recorded timeline step (results + the `now` it was folded with).
fun recordStep(results: List<ToolResult>, now: Long): RecordedStep = RecordedStep(results, now)
