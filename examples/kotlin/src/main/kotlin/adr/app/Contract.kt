// ── app/contract — the app's closed sets (I2) ──────────────────────────────
// The ONE place in the system that may name every block. The spine may not name a
// block and a block may not name a sibling (both L1), so the product of the slices
// has exactly one legal home: the root.
//
// Note what is NOT here: the three transport unions. In Kotlin a sealed hierarchy
// closes itself — the blocks contribute their cases in adr.contract and the compiler
// already knows the set is complete. That is the whole of the TypeScript/Kotlin
// delta in §11.4: TS must write the unions out; Kotlin gets them for free.
//
// State is a PRODUCT, not a sum: this application has exactly one whole-state shape,
// so every closed set INSIDE State is sealed while State itself is a record.

package adr.app

import adr.blocks.analysis.Analysis
import adr.blocks.analysis.AnalysisSlice
import adr.blocks.analysis.AnalysisView
import adr.blocks.artifact.Artifact
import adr.blocks.artifact.ArtifactSlice
import adr.blocks.artifact.ArtifactView
import adr.blocks.console.Console
import adr.blocks.console.ConsoleSlice
import adr.blocks.console.ConsoleView
import adr.blocks.escalation.Escalation
import adr.blocks.escalation.EscalationSlice
import adr.blocks.escalation.EscalationView
import adr.blocks.inbox.Inbox
import adr.blocks.inbox.InboxSlice
import adr.blocks.inbox.InboxView
import adr.blocks.triage.Ticket
import adr.blocks.triage.Triage
import adr.blocks.triage.TriageSlice
import adr.blocks.triage.TriageView
import adr.spine.pure.PanelId
import adr.spine.pure.SpineSlice
import adr.spine.pure.ViewModel

/**
 * Every slice defaults to its own block's `initial`, so plugging a block in is ONE
 * appended field here — a seeding line is needed only for a block that starts non-empty.
 */
data class State(
    val spine: SpineSlice = SpineSlice.initial,
    val triage: TriageSlice = Triage.initial,
    val escalation: EscalationSlice = Escalation.initial,
    val console: ConsoleSlice = Console.initial,
    val artifact: ArtifactSlice = Artifact.initial,
    /** The tiering rung (11): what this tier recalled, and what it published. */
    val analysis: AnalysisSlice = Analysis.initial,
    /** The barge-in rung (12): what was shed while busy, and what failed. */
    val inbox: InboxSlice = Inbox.initial,
)

/** The block views composed onto the spine's ViewModel root. */
data class AppView(
    val root: ViewModel,
    val triage: TriageView,
    val escalation: EscalationView,
    val console: ConsoleView,
    val artifact: ArtifactView,
    val analysis: AnalysisView,
    val inbox: InboxView,
)

/** Only the blocks that start non-empty are seeded; the rest take their own defaults. */
fun initialState(
    tickets: List<Ticket> = emptyList(),
    panels: List<PanelId> = listOf(PanelId("queue"), PanelId("detail"), PanelId("audit")),
): State = State(
    triage = Triage.slice(tickets),
    escalation = Escalation.slice(tickets.map { it.id }),
    console = Console.slice(panels),
)
