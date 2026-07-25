// ── test/spine/context — F4/G15: the third projection, and its bound ──────
// The reasoner's input used to be the one seam with no type, no projection, no
// bound, no capture rule and no test layer. This file is the test layer.

package adr.spine

import adr.app.initialState
import adr.app.Env
import adr.app.projectContextApp
import adr.app.Wiring
import adr.blocks.triage.SET_PRIORITY
import adr.blocks.triage.Ticket
import adr.blocks.triage.TriageBlock
import adr.human
import adr.spine.pure.MAX_CONTEXT_LINES_PER_BLOCK
import adr.spine.pure.MAX_CONTEXT_NOTICES
import adr.spine.pure.Notice
import adr.spine.pure.SpineSlice
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.TicketId
import adr.spine.pure.Timestamp
import adr.spine.pure.ToolName
import adr.spine.pure.ContextRenderer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The blocks that contribute context lines: triage, escalation, console, analysis, inbox. */
private const val CONTEXT_LINE_BLOCKS = 5

class ContextTest {

    @Test
    fun `projectContext is a pure function of committed state plus this turn's staged input`() {
        val state = initialState(listOf(Ticket(TicketId("4118"), "refund not received")))
        val staged = listOf(
            StagedInput.Perceived(SourceName("inbox"), "customer says the refund never arrived"),
        )

        val context = projectContextApp(state, staged)

        assertEquals(staged, context.staged)
        assertEquals(0, context.artifactLineCount)
        assertTrue(context.lines.any { it.contains("ticket 4118") })
        // Calling it again on the same state gives the same value — it is a projection,
        // not an accumulator. Nothing was appended anywhere.
        assertEquals(context, projectContextApp(state, staged))
    }

    @Test
    fun `G15 - the context is BOUNDED, so it does not grow with session length`() {
        val tickets = (1..500).map { Ticket(TicketId("T$it"), "body $it") }
        val noisy = initialState(tickets).let { s ->
            s.copy(
                spine = SpineSlice(
                    run = s.spine.run,
                    notices = (1..200).map { Notice.Rejected(Timestamp(it.toLong()), ToolName("t$it"), "r$it") },
                ),
            )
        }

        val context = projectContextApp(noisy, emptyList())

        assertEquals(MAX_CONTEXT_LINES_PER_BLOCK, TriageBlock().contextLines(noisy.triage).size)
        assertEquals(MAX_CONTEXT_NOTICES, context.notices.size)
        assertTrue(context.lines.size <= CONTEXT_LINE_BLOCKS * MAX_CONTEXT_LINES_PER_BLOCK)
        // The artifact contributes a COUNT, never content — a long session cannot inflate it.
        assertEquals(0, context.artifactLineCount)
        assertTrue(
            ContextRenderer().render(context).lines().size <=
                CONTEXT_LINE_BLOCKS * MAX_CONTEXT_LINES_PER_BLOCK + MAX_CONTEXT_NOTICES + 2,
        )
    }

    @Test
    fun `the rendered digest and the prompt version ride the committed record (14_7)`() {
        val app = Wiring().wireApp(Env())
        app.human(SET_PRIORITY, "ticket" to "4118", "level" to "High")

        val fixture = app.bus.records().single().context
        assertEquals("triage-prompt@1", fixture.promptVersion)
        // The digest is the state as it was BEFORE the step — the input the model saw.
        assertEquals(ContextRenderer().render(projectContextApp(app.initial, emptyList())), fixture.digest)
    }
}
