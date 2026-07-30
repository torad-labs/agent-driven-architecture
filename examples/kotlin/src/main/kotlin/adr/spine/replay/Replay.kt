// ── spine/replay/replay — a LIVE run against its REPLAY (G9) ───────────────
// The shipped harness folded the same in-memory array TWICE through a pure
// function and asserted equality — true by definition, and measured to pass even
// with seam 07's own named violation injected (a tool reading a mutable global and
// performing a side effect). That double-fold is DELETED. It caught nothing, and
// the thing it claimed to catch is structurally impossible for it to see.
//
// What replay actually buys (14.1.1): determinism over a RECORDED TIMELINE —
// forensics, audit, production-traces-as-fixtures. It is NOT behavioural
// reproducibility: re-running the model is not deterministic, and inputs conflated
// away were never recorded. What IS guaranteed is that the run that WAS recorded
// re-derives exactly, bit for bit, from its own committed bytes.
//
// A live-source tool is caught by a CHECK (gate check C8), not by this harness.
//
// TWO CONSTRUCTED HOSTS, no top-level functions:
//
//     Replay(fold).refold(initial, records)                       -> RefoldOutcome
//     Replay(fold).stateAtStep(initial, records, k)               -> the same, over a PREFIX
//     Replay(fold).collectPerform(initial, records, sink, mode)
//     ReplayFaithfulness(fold, projectContext, promptVersion)
//         .assertFaithful(initial, records, liveState, liveEffects)
//
// The split is the one spine/boundary/Action.kt already makes: what is CONSTANT for
// one app — the fold, the projection, the prompt version — is constructor-held and
// drops out of every signature; what VARIES per call — which timeline, which sink,
// which mode — stays an argument. A top-level function has no instance: nothing
// builds it, so nothing can stand in for it, so it can only be reached through
// whatever calls it.
//
// `fold` is INJECTED here, which is the opposite of the choice Boundary.kt makes for
// its gate, and the difference is structural rather than stylistic. The spine is
// generic in S precisely because it cannot know the app's fold, and replay is
// READ-ONLY over an already-committed bus: it mints no ToolResult and appends
// nothing, so C7's single-production-site guarantee is untouched by letting a caller
// bind it. A bindable gate would be a bypassable gate; a bindable re-fold bypasses
// nothing, because there is no authority on this path to bypass.
//
// ReplayFaithfulness BUILDS its own re-fold instead of accepting one, for the
// inverse reason: its digest walk and its re-fold must provably follow the SAME
// fold. Hand the two halves different folds and the assertion compares two
// different runs and passes — the vacuous harness this file exists to end.

package adr.spine.replay

import adr.contract.ToolResult
import adr.spine.ports.Sink
import adr.spine.pure.ContextFixture
import adr.spine.pure.EffectKey
import adr.spine.pure.Fold
import adr.spine.pure.KeyedEffect
import adr.spine.pure.PerformMode
import adr.spine.pure.ProjectContext
import adr.spine.pure.SourceKey
import adr.spine.pure.StagedInput
import adr.spine.pure.StepIndex
import adr.spine.pure.StepRecord
import adr.spine.pure.Timestamp
import adr.spine.pure.ContextRenderer

data class RefoldOutcome<S>(val state: S, val effects: List<KeyedEffect>)

/**
 * Re-derivation over ONE app's fold. The fold is identical on every call inside an
 * app, so it is constructor state and both members lose it from their signatures;
 * the timeline, the sink and the mode vary per call and stay arguments.
 */
class Replay<S>(private val fold: Fold<S>) {

    /**
     * Re-fold ONLY the committed bytes. Every effect is re-keyed from the record's own
     * offset, so the re-derived sequence is comparable to the live one key for key —
     * including every timestamp, which is why `now` had to ride the record (G9).
     */
    fun refold(initial: S, records: List<StepRecord>): RefoldOutcome<S> {
        var state = initial
        val effects = mutableListOf<KeyedEffect>()
        records.forEachIndexed { step, record ->
            val (next, produced) = fold(state, record.results, record.now, record.sig)
            state = next
            produced.forEachIndexed { i, effect ->
                effects += KeyedEffect(EffectKey(StepIndex(step), i), effect)
            }
        }
        return RefoldOutcome(state, effects)
    }

    /**
     * THE SCRUB (14.1): what the system believed at step [k], re-derived from the prefix
     * of the timeline that ends there and from nothing else.
     *
     * The book's own equation names this operation `stateAtStep`, so the port spells it
     * the same way rather than inventing a second word for it. A MEMBER of [Replay], not
     * a top-level function, for this file's own stated reason: it re-folds, so it needs
     * the app's fold, and the fold is what this host is constructed with.
     *
     * It returns the same [RefoldOutcome] as [refold] deliberately. The effects a prefix
     * produced are half of "what the system believed at k" — a scrub that shows state and
     * hides the on-call page it had already sent is a lie of omission — and every one of
     * them is keyed off its record's own offset, so a prefix re-fold's keys are the keys
     * the live run wrote.
     *
     * [k] is clamped by TAKING, never by throwing: the pure ring does not raise on a
     * caller's arithmetic, and a playhead dragged past either end of a timeline is a UI
     * event, not a fault. Below zero yields the initial state; beyond the end yields the
     * whole timeline — and BOTH ends are asserted, at an interior k and at the right
     * edge, in test/spine/ReplayTest.kt.
     *
     * Nothing is memoized and nothing is versioned here. This IS the fold; a bounded-cost
     * memo of a prefix, and whatever marker would make such a memo trustworthy, is a
     * separate concern with a decision of its own.
     */
    fun stateAtStep(initial: S, records: List<StepRecord>, k: Int): RefoldOutcome<S> =
        refold(initial, records.take(k.coerceAtLeast(0)))

    /**
     * Drive the perform seam from a recorded timeline. In REPLAY the sink collects the
     * descriptor and touches nothing; in RECOVERY it re-drives un-acknowledged effects
     * and dedupes on the key.
     */
    fun collectPerform(initial: S, records: List<StepRecord>, sink: Sink, mode: PerformMode) {
        refold(initial, records).effects.forEach { sink.perform(it, mode) }
    }

    /**
     * Memoize the fold of the first [at] committed steps (14.1). BOTH tag fields are
     * derived from the prefix that was ACTUALLY folded, never from [at], so a snapshot
     * cannot be minted already lying about its own extent.
     */
    fun snapshotAt(
        initial: S,
        records: List<StepRecord>,
        at: Int,
        reducerVersion: String,
    ): Snapshot<S> {
        val prefix = records.take(at.coerceAtLeast(0))
        val outcome = refold(initial, prefix)
        val last = prefix.lastOrNull()
        return Snapshot(
            SnapshotTag(
                reducerVersion,
                prefix.size,
                last?.let { RecordMark(it.now, it.context.digest, it.results) },
            ),
            outcome.state,
            outcome.effects,
        )
    }

    /**
     * Resume a re-fold from a snapshot instead of from genesis — and REFUSE rather than
     * trust. Four questions, in order: is this the reducer you are folding with, does
     * the log CONFIRM the record this prefix stops at, is the tail's declared origin a
     * real position at all, and do the two extents agree numerically. Each is its own
     * branch, so each has its own failing case and none can mask another. On acceptance
     * the outcome is indistinguishable from a whole-timeline [refold] — same state,
     * same keys, same timestamps.
     *
     * The extent comparison is `==` on a [RecordMark], which is a data class: a null on
     * ONE side is a disagreement, because "my prefix is empty" and "something precedes
     * this tail" are contradictory claims. The TypeScript port spells that out as a
     * five-line predicate because a TS interface has no structural equality; same
     * component, spelled per language (1.3).
     */
    fun refoldFrom(snapshot: Snapshot<S>, tail: TimelineTail, reducerVersion: String): Resume<S> {
        if (snapshot.tag.reducerVersion != reducerVersion) {
            return Resume.Refused(
                "snapshot taken under reducer ${snapshot.tag.reducerVersion}, " +
                    "resumed under $reducerVersion",
            )
        }
        if (snapshot.tag.coveredThrough != tail.follows) {
            return Resume.Refused(
                "the log does not confirm the record this snapshot stops at " +
                    "(tag offset ${snapshot.tag.offset}, tail from ${tail.from})",
            )
        }
        // A served tail follows nothing IF AND ONLY IF it begins at the origin. Both
        // out-of-range ends (negative AND past the last record) serve `follows = null`,
        // so a one-sided `from < 0` fence left the upper end agreeing vacuously with a
        // fresh snapshot's null mark — review resumed the INITIAL state as the whole
        // session that way, silently.
        if ((tail.follows == null) != (tail.from == 0)) {
            return Resume.Refused("the log does not serve a tail beginning at ${tail.from}")
        }
        if (snapshot.tag.offset != tail.from) {
            return Resume.Refused(
                "snapshot covers ${snapshot.tag.offset} committed steps; " +
                    "the tail declares it begins at ${tail.from}",
            )
        }
        var state = snapshot.state
        val effects = snapshot.effects.toMutableList()
        // `tail.from` equals `tag.offset` by the guard above; the log's own number is
        // the one these records actually sit at, so it is the one keys are minted from.
        tail.records.forEachIndexed { i, record ->
            val (next, produced) = fold(state, record.results, record.now, record.sig)
            state = next
            produced.forEachIndexed { j, effect ->
                effects += KeyedEffect(EffectKey(StepIndex(tail.from + i), j), effect)
            }
        }
        return Resume.Resumed(RefoldOutcome(state, effects))
    }
}

/**
 * The two reads a RESTART needs off the bus alone (12.2/14.1): the durable dedupe
 * scope, and the tail a snapshot is resumed over. Neither needs a fold — both are
 * committed data rather than derived state — so they live in their own small host
 * rather than in [Replay], which exists to re-run one.
 */
class Recovery {

    /**
     * Every source key a committed step consumed. The key rides the committed
     * `Perceived` fixture for exactly this reason: a restarted consumer is seeded
     * with these, so redelivered work that already committed is refused instead of
     * folded twice. Work that never committed leaves no key here and is retried —
     * the other half of the same contract.
     */
    fun committedSourceKeys(records: List<StepRecord>): Set<SourceKey> =
        records.flatMap { record ->
            record.staged.filterIsInstance<StagedInput.Perceived>().map { it.key }
        }.toSet()

    /**
     * The LOG's half of the resume seam (14.1): everything from [from] onward, the
     * offset it was read at, and — the field that gives a snapshot's tag something to
     * disagree WITH — the mark of the record it finds immediately before them, read off
     * its own bytes.
     *
     * An origin the log does not have (negative, or past the end) is served as NOTHING
     * rather than clamped into a plausible slice: a tail that begins nowhere carries
     * nothing, and says so in `follows`.
     */
    fun tailFrom(records: List<StepRecord>, from: Int): TimelineTail {
        val within = from in 0..records.size
        val previous = if (within && from >= 1) records[from - 1] else null
        return TimelineTail(
            from,
            if (within) records.drop(from) else emptyList(),
            previous?.let { RecordMark(it.now, it.context.digest, it.results) },
        )
    }
}

/**
 * The real harness: assert a LIVE run against its REPLAY.
 *
 * Three assertions, none of them f(x) == f(x):
 *   1. the re-folded state equals the live state;
 *   2. the re-derived effect sequence equals the live one — keys AND timestamps;
 *   3. every step's recorded context digest still matches what projectContext
 *      produces from the state as it was BEFORE that step (G15/§5.3), so a change to
 *      the reasoner's input that silently alters what the model saw fails the
 *      golden trace — without re-running the model.
 *
 * The three values it holds are exactly the three the Boundary holds (Boundary.kt:56-58),
 * because assertion 3 has to re-derive the fixture the boundary committed.
 */
class ReplayFaithfulness<S>(
    private val fold: Fold<S>,
    private val projectContext: ProjectContext<S>,
    private val promptVersion: String,
) {

    /**
     * Built here, never injected. Assertions 1–2 re-fold and assertion 3 walks the
     * same records step by step; a harness that let those two halves be handed
     * different folds would compare two different runs and pass.
     */
    private val replay = Replay(fold)

    fun assertFaithful(
        initial: S,
        records: List<StepRecord>,
        liveState: S,
        liveEffects: List<KeyedEffect>,
    ) {
        var state = initial
        records.forEachIndexed { step, record ->
            val expected = ContextFixture(promptVersion, ContextRenderer().render(projectContext(state, record.staged)))
            check(record.context == expected) {
                "replay: the context fixture committed at step $step does not match the projection"
            }
            state = fold(state, record.results, record.now, record.sig).first
        }

        val outcome = replay.refold(initial, records)
        check(outcome.state == liveState) { "replay: the re-folded state differs from the live state" }
        check(outcome.effects == liveEffects) {
            "replay: the re-derived effect sequence differs from the live one"
        }
    }
}

// ── SNAPSHOT — a memoized fold prefix, and a tag that can REFUSE (14.1) ────
// Folding from genesis on every restart, scrub or recovery is O(timeline), and the
// deployments this architecture most recommends — a server agent, an ambient
// assistant — run indefinitely. 14.1's steel note gives the purity-preserving
// extension and its equation:
//
//     fold(snapshot@k, timeline[k..])  ==  fold(initialState, timeline)
//
// …and the rule that keeps it honest: tag every snapshot with the REDUCER VERSION
// and the TIMELINE OFFSET it covers, because a snapshot taken under an old reducer
// is untrustworthy under a new one (14.7).
//
// A TAG THAT IS ONLY CARRIED IS DECORATION — and an integer cannot police itself.
// Take the ONLY resume site a STORED snapshot permits: a reader holds a snapshot
// blob and a log, and nothing else in this system knows which prefix that blob
// covers, because [StepRecord] carries no step index. So the reader must ask the log
// for the tail at `snapshot.tag.offset`, and any check of the form
// `tag.offset == tail.from` is then `x == x`. Corrupt the integer and the wrong tail
// folds into a plausible answer. That is MEASURED, not feared: against a first draft
// of this file, eight of eight corrupted offsets resumed.
//
// So the extent is checked by CONTENT, and the two halves have two authors:
//
//   · [SnapshotTag.coveredThrough] — the mark of the last record the prefix ACTUALLY
//     folded, copied off that record when the snapshot was minted.
//   · [TimelineTail.follows] — the mark of the record the LOG finds immediately
//     before the tail it hands back, read from its own bytes at resume time.
//
// Two sources, one fact. Hand the resume a corrupted offset and the log answers with
// a DIFFERENT record's mark, so the seam disagrees instead of folding.
//
// The bare offsets are still compared, and that check is not redundant: it is the one
// that catches a snapshot whose literal was misfiled against a tail somebody ELSE
// selected — the case where the two numbers genuinely do have two authors. It is a
// cheap second opinion, not the load-bearing one.
//
// WHAT THIS SEAM CANNOT SEE, said here rather than left for a reader to discover.
// The mark discriminates two offsets only when the two records DIFFER, and nothing
// in this reference guarantees that:
//
//   · two records with the same `now` AND the same rendered context are one fact to
//     this seam, so a drift between exactly those two offsets resumes. Both halves
//     earn their place against that — THIS port's canonical session contains a pair
//     whose contexts render identically, separated only by the clock; freeze the
//     clock and the mark separates 7 of 8. Measured, pinned in ReplayTest, not
//     closed.
//   · two DIFFERENT logs whose boundary records are byte-identical are likewise
//     indistinguishable.
//   · a tag forged CONSISTENTLY — offset and mark moved together — is a forgery of
//     the snapshot's own provenance that no tag field can catch.
//
// A deployment that needs more than this gives the log a per-record identity the
// reference does not mint; that is a store's job, and the store is product-owned
// (16.2).
//
// The tail stays an ARGUMENT rather than something [Replay.refoldFrom] slices out of
// a whole timeline, because 14.1's steel note says compacting below a snapshot trades
// away the ability to scrub or fork before that point: a resume that demanded the
// whole log could not run in the deployment that note exists for. A compacting store
// persists its boundary mark; [Recovery.tailFrom] computes it from the records it
// still holds.
//
// The snapshot stays a DERIVED CACHE: nothing here appends, and the timeline can
// always rebuild it. WHERE a snapshot is STORED, and how far below one a deployment
// may compact, remain product policy (16.2).

/**
 * The committed identity of ONE step, copied verbatim off two fields the step already
 * committed. Deliberately NOT a hash: a hash would need a canonical encoding (14.1)
 * and would owe the TypeScript port a cross-language guarantee neither port is making.
 */
data class RecordMark(
    val now: Timestamp,
    val digest: String,
    /**
     * The step's committed results, verbatim. Review built a canonical session in which
     * two adjacent records share (now, digest) — a coarse clock plus an unchanged
     * rendered context — and a corrupted offset then resumed a wrong tail with every
     * mark agreeing. The results list separates every record the reference commits.
     */
    val results: List<ToolResult>,
)

/**
 * Which reducer produced this prefix, how many committed steps it covers, and — the
 * field that makes the offset checkable at all — WHICH record it stops at, null
 * exactly when the prefix is empty. 14.1 says "tag every snapshot with the reducer
 * version and timeline offset it covers"; that is a floor on what a tag must carry,
 * not a ceiling.
 */
data class SnapshotTag(
    val reducerVersion: String,
    val offset: Int,
    val coveredThrough: RecordMark?,
)

/**
 * A snapshot IS a re-fold of a prefix — the state and the keyed effects that prefix
 * produced — plus the tag saying which prefix, under which reducer.
 */
data class Snapshot<S>(val tag: SnapshotTag, val state: S, val effects: List<KeyedEffect>)

/**
 * The LOG's half of the resume seam: some records, the offset the log says they begin
 * at, and the mark of what it finds immediately before them — null exactly when
 * nothing does. Read off the timeline by [Recovery.tailFrom], never off a snapshot.
 */
data class TimelineTail(
    val from: Int,
    val records: List<StepRecord>,
    val follows: RecordMark?,
)

/**
 * The verdict of a resume. Total, like every other spine seam: a refusal is a value
 * the caller must open, not a thrown gate — and `when` over it is closed (G12), so a
 * third verdict added later breaks every consumer at compile time.
 */
sealed class Resume<out S> {
    data class Resumed<S>(val outcome: RefoldOutcome<S>) : Resume<S>()
    data class Refused(val cause: String) : Resume<Nothing>()
}
