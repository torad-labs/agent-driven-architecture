// ── spine/pure/step-record — THE unit of commit and THE unit of replay (G9) ─
// The shipped reference committed `append(signedCommands, capturedResults)` — no
// clock. A live boundary that folded at now=1001 re-folded at now=0, because the
// only thing that could have carried the timestamp was never written down.
//
// The commit is the STEP, not the pair. `now` rides the record, or a re-fold
// cannot reproduce what a live boundary wrote.
//
// Every field earns its place:
//   schemaVersion  which shape the rest of the record is in (14.7) — the envelope,
//             so a log written across deployments is self-describing
//   now       the injected clock read — without it, timestamps are lost outright
//   sig       the stamp the fold was given (who acted + under whose permission)
//   staged    the ordered off-bus input this step consumed (5.4)
//   actions   what was ASKED — differs from `results` whenever the gate refused
//   results   POST-GATE — exactly what was FOLDED
//   commands  the signed record, with the minted ids that cannot be re-derived
//   context   promptVersion + the rendered digest the model saw (G15/14.7)
//
// THE SCHEMA ENVELOPE (14.7). `schemaVersion` has NO DEFAULT: the one site that
// mints a record has to stamp it, and a historical record — [StepRecordV1] — is
// a DIFFERENT TYPE that `Replay.refold` cannot be handed at all. Upcasting is
// the only way an old log reaches the fold, which is exactly what 14.7 asks
// for: never touch history (14.1); transform on the way in.
//
// Kotlin gets the PAYLOAD half of that refusal for free, and it is worth naming
// because the other port does not: [adr.contract.TriageV1Result] does not extend
// `ToolResult`, so a v1 payload cannot be placed into `results` by hand no matter
// what the envelope says. The TypeScript port is structural and had to buy the
// same guarantee with a conflicting discriminant.

package adr.spine.pure

import adr.contract.Command
import adr.contract.ToolResult

/**
 * Which shape a committed record is in (14.7).
 *
 * A value class, like every other id in this port, so an Int cannot wander into
 * the field by accident. It is deliberately NOT the reducer version a snapshot is
 * tagged with, and NOT the spine version marker that says which template copy this
 * tier is: three independent questions, three independent numbers.
 */
@JvmInline
value class SchemaVersion(val value: Int)

/** The shape this port WRITES today. */
val CURRENT_SCHEMA = SchemaVersion(2)

/**
 * GENESIS is 1, and there is no v0: the reference persists no log, so the first
 * shape it ever wrote is the first shape anything can read. v1 survives as
 * [StepRecordV1] plus a fixture, so the upcast path is exercised rather than
 * described — and it is STAMPED, because a version an old record does not carry is
 * a version nothing could ever have dispatched on.
 */
val GENESIS_SCHEMA = SchemaVersion(1)

data class StepRecord(
    val schemaVersion: SchemaVersion,
    val now: Timestamp,
    val sig: Signature,
    val staged: List<StagedInput>,
    val actions: List<Action>,
    val results: List<ToolResult>,
    val commands: List<Command>,
    val context: ContextFixture,
)

/**
 * THE v1 ENVELOPE — what this port wrote while the version was 1.
 *
 * Generic in its payload, and that is G11 rather than taste: the payload shapes a
 * v1 log holds are a BLOCK's, and the spine may not name a block (gate check C15).
 * So the spine declares the envelope and the app supplies what its old payloads
 * were. `commands` is NOT generic, because Commands do not evolve here — a Command
 * is the signed record of what a principal authorized, and 14.1 forbids rewriting
 * it; the TS port makes the same call for the same reason.
 *
 * It is a separate type rather than a nullable field on [StepRecord], which is the
 * whole point: the two are different types, and only one of them re-folds. Its own
 * `schemaVersion` carries NO DEFAULT either — a fixture that could omit the version
 * would stop standing in for a record that genuinely carried one.
 */
data class StepRecordV1<R>(
    val schemaVersion: SchemaVersion,
    val now: Timestamp,
    val sig: Signature,
    val staged: List<StagedInput>,
    val actions: List<Action>,
    val results: List<R>,
    val commands: List<Command>,
    val context: ContextFixture,
)

/**
 * UPCAST ON READ (14.7): re-stamp the envelope, and lift every payload with the
 * app's own upcaster.
 *
 * A CONSTRUCTED type holding the payload lift, exactly as [adr.spine.replay.Replay]
 * holds the fold: the lift is fixed for one app and varies per call for nothing, so
 * the split rule puts it in the constructor and it drops out of the signature. It
 * touches no history — every call produces a NEW record, which is the difference
 * between upcasting and the rewrite 14.1 forbids.
 */
class SchemaUpcast<R>(private val payload: UpcastResult<R>) {

    fun v1(record: StepRecordV1<R>): StepRecord = StepRecord(
        schemaVersion = CURRENT_SCHEMA,
        now = record.now,
        sig = record.sig,
        staged = record.staged,
        actions = record.actions,
        results = record.results.map { payload(it) },
        commands = record.commands,
        context = record.context,
    )
}
