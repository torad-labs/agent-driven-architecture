// ── test/app/totality — gate check C13, by reflection ─────────────────────
// Every ToolResult case has a Verb entry and signs; every Verb entry has a case; and
// the NAME is the same in all three places (D3). That mapping is what makes the one
// unchecked cast in Verb.signOf total, and what makes 17.6's "the gate keys off
// names" literally true.

package adr.app

import adr.Driver
import adr.contract.Command
import adr.contract.ToolResult
import adr.spine.pure.ToolName
import kotlin.reflect.KClass
import kotlin.test.Test
import kotlin.test.assertEquals
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

class TotalityTest {

    private val registry = Wiring().wireApp(Env()).registry

    /** The spine's own two cases are not verbs — nobody calls them; the boundary mints them. */
    private val spineCases = setOf("unhandled", "refused")

    @Test
    fun `C13 - every ToolResult case has a registry entry, and every entry has a case`() {
        val cases = Sealed().leaves(ToolResult::class).map { Sealed().verbName(it) }.toSet()
        val names = registry.keys.map { it.value }.toSet()

        assertEquals(names, cases - spineCases)
        assertEquals(12, names.size, "six blocks, twelve verbs")
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
    fun `A1 - a presentation verb and a domain verb have the SAME registration shape`() {
        val domain = registry.getValue(ToolName("setPriority"))
        val presentation = registry.getValue(ToolName("setPanel"))
        assertEquals(domain::class, presentation::class, "one tool mechanic, not two")
    }
}
