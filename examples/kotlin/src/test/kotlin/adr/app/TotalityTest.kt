// ── test/app/totality — gate check C13, BOTH HALVES, by reflection ────────
// Every ToolResult case has a Verb entry and signs; every Verb entry has a case; and
// the NAME is the same in all three places (6.8). That mapping is what makes the one
// unchecked cast in Verb.signOf total, and what makes 17.6's "the gate keys off
// names" literally true.
//
// The handler half asks the same question one seam over: every declared `Effect` leaf
// has exactly ONE registered performer, no performer claims a leaf it does not own,
// and an orphan is diagnosed rather than dropped.
//
// `EffectSamples` BELOW IS THE GATE'S OWN TOTALITY LEDGER, and it is stated here
// rather than hidden: it is the ONE out-of-folder site a novel effect kind costs in
// this port. `declaredCases()` above is the same cost for a new VERB and pre-dates the
// split. Neither is a defect; both are equalities against a derivation off the live
// sealed hierarchy, which is what stops the checkers beneath them going vacuous.

package adr.app

import adr.Driver
import adr.blocks.analysis.AnalysisBlock
import adr.blocks.artifact.ArtifactBlock
import adr.blocks.escalation.EscalationBlock
import adr.blocks.triage.TriageBlock
import adr.contract.AnalysisEffect
import adr.contract.ArtifactEffect
import adr.contract.Command
import adr.contract.Effect
import adr.contract.EscalationEffect
import adr.contract.ToolResult
import adr.contract.TriageEffect
import adr.contract.TriageResult
import adr.spine.boundary.RecordingSink
import adr.spine.pure.EffectKey
import adr.spine.pure.EffectPerformer
import adr.spine.pure.Emit
import adr.spine.pure.KeyedEffect
import adr.spine.pure.ORPHAN_EFFECT
import adr.spine.pure.PerformMode
import adr.spine.pure.Performers
import adr.spine.pure.StepIndex
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName
import kotlin.reflect.KClass
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Walking a sealed hierarchy, on a constructed type — test sources are in scope too. */
private class Sealed {

    fun leaves(type: KClass<*>): List<KClass<*>> =
        if (type.sealedSubclasses.isEmpty()) listOf(type)
        else type.sealedSubclasses.flatMap { leaves(it) }

    fun verbName(type: KClass<*>): String =
        (type.simpleName ?: error("a sealed subclass is never anonymous: $type"))
            .replaceFirstChar { it.lowercase() }
}

/**
 * The C13 checker itself, on a constructed type. C13 is a question about VALUES, so
 * its fixture pair is a pair of INPUTS to one checker rather than a pair of files on
 * disk — same checker, two inputs, exactly like the TS port's `registryGaps`. The
 * ALLOW half runs it over the shipped registry; the BLOCK half pulls one verb out
 * and watches it deny. A check nobody has watched fail is not a check.
 */
private class Totality {

    fun gaps(cases: Set<String>, names: Set<String>): List<String> =
        (cases - names).map { "\"$it\" is a declared ToolResult case with no Verb entry" } +
            (names - cases).map { "\"$it\" is registered but declares no ToolResult case" }
}

class TotalityTest {

    private val registry = Wiring().wireApp(Env()).registry

    /** The spine's own two cases are not verbs — nobody calls them; the boundary mints them. */
    private val spineCases = setOf("unhandled", "refused")

    private fun declaredCases(): Set<String> =
        Sealed().leaves(ToolResult::class).map { Sealed().verbName(it) }.toSet() - spineCases

    @Test
    fun `C13 - every ToolResult case has a registry entry, and every entry has a case`() {
        val names = registry.keys.map { it.value }.toSet()

        assertEquals(emptyList(), Totality().gaps(declaredCases(), names))
        assertEquals(12, names.size, "six blocks, twelve verbs")
    }

    @Test
    fun `C13 BLOCK-TEST - a registry with a verb pulled out is DENIED`() {
        val thinned = registry.keys.map { it.value }.toSet() - "confirmSeal"

        assertEquals(
            listOf("\"confirmSeal\" is a declared ToolResult case with no Verb entry"),
            Totality().gaps(declaredCases(), thinned),
        )
    }

    @Test
    fun `C13 - the Command hierarchy mirrors the ToolResult hierarchy, name for name`() {
        val results = Sealed().leaves(ToolResult::class).map { Sealed().verbName(it) }.toSet()
        val commands = Sealed().leaves(Command::class).map { Sealed().verbName(it) }.toSet()
        assertEquals(results, commands)
    }

    @Test
    fun `C13 - every committed Command carries a name the registry knows`() {
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = World(), authority = authority))
        Driver().driveCanonicalSession(app, authority)
        Driver().human(app, ToolName("noSuchTool"))

        val committed = app.bus.records().flatMap { it.commands }
        assertTrue(committed.isNotEmpty())
        committed.forEach { command ->
            val known = command.tool in registry.keys ||
                command is Command.Unhandled ||
                command is Command.Refused
            assertTrue(known, "unsignable command: $command")
        }
    }

    @Test
    fun `ONE MECHANIC - a presentation verb and a domain verb have the SAME registration shape`() {
        val domain = registry.getValue(ToolName("setPriority"))
        val presentation = registry.getValue(ToolName("setPanel"))
        assertEquals(domain::class, presentation::class, "one tool mechanic, not two")
    }
}

/**
 * ONE SAMPLE PER DECLARED EFFECT LEAF, so the handler check can drive a REAL effect
 * through a REAL sink rather than assert about a table.
 *
 * The map is hand-written and that is the point: its key set is asserted EQUAL to the
 * set Kotlin reflection derives from the live sealed hierarchy, so a leaf added
 * anywhere in the system fails here — loudly — instead of leaving the checker below
 * matching a set that quietly stopped being the system's. That is the C7 rot, refused
 * in advance, and it is the same move `declaredCases()` above makes for ToolResult.
 *
 * It is ALSO the out-of-folder cost of a novel effect kind in this port. Counted, in
 * the composition root's receipt, rather than claimed away.
 */
private class EffectSamples {

    fun samples(): Map<String, Effect> = mapOf(
        "Diag" to Effect.Diag(Timestamp(1), "a diagnostic line"),
        "LogDecision" to TriageEffect.LogDecision(
            Timestamp(2),
            TicketId("4118"),
            TriageResult.Priority.High,
            null,
            null,
        ),
        "PageOncall" to EscalationEffect.PageOncall(Timestamp(3), TicketId("4118")),
        "DeliverArtifact" to ArtifactEffect.DeliverArtifact(Timestamp(4), emptyList()),
        "PublishConclusion" to AnalysisEffect.PublishConclusion(Timestamp(5), "a conclusion"),
    )

    /** Which leaves each registered performer OWNS. Asserted total against both the
     *  derived leaf set and the shipped assembly, so a new leaf or a new contributing
     *  block cannot be answered by an out-of-date map. */
    fun owners(): Map<String, Set<String>> = mapOf(
        "triage" to setOf("LogDecision"),
        "escalation" to setOf("PageOncall"),
        "artifact" to setOf("DeliverArtifact"),
        "analysis" to setOf("PublishConclusion"),
        "spine" to setOf("Diag"),
    )
}

/**
 * Gate check C13, HANDLER HALF — every declared effect kind has exactly one registered
 * performer, no performer claims more than its own, and an orphaned effect is
 * diagnosed rather than dropped.
 *
 * Same checker, two inputs, exactly like the registry half above: the ALLOW test runs
 * the SHIPPED assembly, the BLOCK test runs one built with a performer withheld. A
 * check nobody has watched fail is not a check — and the BLOCK half drives its effect
 * through the real [AppSink], because a test that called the floor directly would
 * prove the floor exists, not that anything reaches it.
 */
class EffectTotalityTest {

    private val world = World()
    private val env = Env(world = world)

    private fun leaves(): Set<String> =
        Sealed().leaves(Effect::class).mapNotNull { it.simpleName }.toSet()

    private fun withheld(log: MutableList<String>): Performers = Performers(
        listOf(
            TriageBlock().performer { log += it },
            ArtifactBlock().performer(env.delivery),
            AnalysisBlock().performer(env.relay),
            DiagPerformer(log).performer(),
        ),
    )

    @Test
    fun `C13 - the sample set is DERIVED from the live sealed hierarchy, and is not empty`() {
        val declared = leaves()
        assertTrue(
            declared.isNotEmpty(),
            "the Effect hierarchy walked to nothing — the derivation is vacuous",
        )
        assertEquals(declared, EffectSamples().samples().keys)
        // The known spellings, pinned: a rename that silently de-scoped the checker
        // would leave the two sets equal and both wrong.
        assertTrue(
            declared.containsAll(
                setOf("Diag", "LogDecision", "PageOncall", "DeliverArtifact", "PublishConclusion"),
            ),
            "a known effect kind vanished from the derivation: $declared",
        )
        // …and the owner map is total over the same derived set, so the
        // exactly-its-own-leaves test below cannot go vacuous either.
        assertEquals(declared, EffectSamples().owners().values.flatten().toSet())
    }

    @Test
    fun `C13 ALLOW - the shipped dispatcher performs every declared effect leaf`() {
        val log = mutableListOf<String>()
        val performers = Wiring().effectPerformers(env, log)
        val orphans = EffectSamples().samples()
            .filterValues { performers.perform(it) != null }
            .keys
        assertEquals(emptySet(), orphans, "an effect kind no registered performer claims")
        assertEquals(
            listOf("triage", "escalation", "artifact", "analysis", "spine"),
            performers.blocks(),
            "four blocks of six contribute, plus the spine's own Diag at the root",
        )
    }

    /**
     * THE OVER-CLAIM DENIAL. [Performers.perform] is first-claim-wins over an ORDERED
     * list, and every `narrow` is a lambda authored inside a block file that no lint
     * reads. A block whose narrow widened to the whole of `Effect` would swallow every
     * effect registered behind it — including the spine's own `Diag`, which is last —
     * and the ALLOW half above would stay green, because every leaf would still
     * "perform". So each performer is asked to REFUSE every sample outside its own
     * sub-union.
     *
     * Red-proven by widening escalation's narrow to fabricate an `EscalationEffect`
     * from anything: this test then names escalation, and nothing else changes.
     */
    @Test
    fun `C13 - each registered performer claims EXACTLY its own leaves`() {
        val log = mutableListOf<String>()
        val performers = Wiring().effectPerformers(env, log).claims()
        val owners = EffectSamples().owners()
        val samples = EffectSamples().samples()

        assertEquals(
            owners.keys,
            performers.map { it.block }.toSet(),
            "the owner map and the shipped assembly must name the same blocks",
        )

        val overclaimed = performers.flatMap { performer ->
            val mine = owners.getValue(performer.block)
            samples.filterKeys { it !in mine }
                .filterValues { performer.tryPerform(it) }
                .keys
                .map { "${performer.block} claimed `$it`, which is not its own" }
        }
        assertEquals(emptyList(), overclaimed, "a performer that over-claims hijacks the scan")
    }

    @Test
    fun `C13 BLOCK - a dispatcher with one performer withheld names the orphaned kind`() {
        val log = mutableListOf<String>()
        val orphan = withheld(log).perform(EffectSamples().samples().getValue("PageOncall"))

        assertEquals(
            "$ORPHAN_EFFECT `PageOncall`",
            orphan?.note,
            "the withheld kind must be named, not merely counted",
        )
        // …and every OTHER kind still performs, so the block half is denying one thing.
        assertNull(withheld(log).perform(EffectSamples().samples().getValue("LogDecision")))
    }

    @Test
    fun `C13 BLOCK - the orphan is DIAGNOSED at the real sink, never silent and never a crash`() {
        val log = mutableListOf<String>()
        val sink = RecordingSink(AppSink(withheld(log), DiagPerformer(log)))

        sink.perform(
            KeyedEffect(
                EffectKey(StepIndex(0), 0),
                EffectSamples().samples().getValue("PageOncall"),
            ),
            PerformMode.LIVE,
        )

        assertEquals(listOf("diag[3] $ORPHAN_EFFECT `PageOncall`"), log)
        assertEquals(emptyList(), world.pages, "the withheld port was NOT reached")
        assertEquals(1, sink.performed.size, "and the descriptor still crossed the seam")
    }

    @Test
    fun `C13 - REPLAY still touches nothing, dispatcher or not`() {
        val log = mutableListOf<String>()
        val sink = AppSink(Wiring().effectPerformers(env, log), DiagPerformer(log))

        sink.perform(
            KeyedEffect(
                EffectKey(StepIndex(0), 0),
                EffectSamples().samples().getValue("PageOncall"),
            ),
            PerformMode.REPLAY,
        )

        assertEquals(emptyList(), world.pages)
        assertEquals(emptyList(), log)
    }

    /**
     * TIER INDEPENDENCE — the reason the assembly sits BESIDE the verb registry.
     *
     * Handlers are assembled by `Wiring.effectPerformers`, not carried on
     * `BlockRegistration`. That fork is not pinned by any ratified decision, so it owes
     * a proof: a two-of-six DEEP_TIER app registers two blocks' VERBS and must still
     * perform every effect kind in the system. On `BlockRegistration` it would ship a
     * partial performer set and handler totality would be unstateable.
     *
     * The tier is asserted to be genuinely REDUCED in the same test, so a wiring that
     * silently ignored `env.verbs` could not satisfy it.
     */
    @Test
    fun `C13 - a DEEP_TIER wiring still performs every declared effect kind`() {
        val deepEnv = Env(world = World(), verbs = DEEP_TIER)
        val deep = Wiring().wireApp(deepEnv)
        val whole = Wiring().wireApp(Env(world = World()))
        assertTrue(
            deep.registry.size < whole.registry.size,
            "the tier must actually be reduced, or this proves nothing: " +
                "${deep.registry.size} vs ${whole.registry.size}",
        )

        val log = mutableListOf<String>()
        val performers = Wiring().effectPerformers(deepEnv, log)
        val orphans = EffectSamples().samples()
            .filterValues { performers.perform(it) != null }
            .keys
        assertEquals(emptySet(), orphans, "a reduced tier must still be TOTAL over effects")
    }

    @Test
    fun `THE ASSEMBLY REFUSES two blocks claiming one seam`() {
        val log = mutableListOf<String>()
        val emit = Emit<String> { line -> log += line }
        val twice: List<EffectPerformer<*>> = listOf(
            TriageBlock().performer(emit),
            TriageBlock().performer(emit),
        )
        val failure = assertFailsWith<IllegalStateException> { Performers(twice) }
        assertTrue(
            failure.message.orEmpty().contains("same name"),
            "the refusal must name what collided: ${failure.message}",
        )
    }
}
