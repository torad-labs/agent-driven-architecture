// ── app/contract — the app's closed sets (G10) ──────────────────────────────
// The ONE place in the system that may name every block. The spine may not name a
// block and a block may not name a sibling (both G11), so the product of the slices
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

import adr.blocks.analysis.AnalysisSlice
import adr.blocks.analysis.AnalysisView
import adr.blocks.artifact.ArtifactSlice
import adr.blocks.artifact.ArtifactView
import adr.blocks.console.ConsoleBlock
import adr.blocks.console.ConsoleSlice
import adr.blocks.console.ConsoleView
import adr.blocks.escalation.EscalationBlock
import adr.blocks.escalation.EscalationSlice
import adr.blocks.escalation.EscalationView
import adr.blocks.inbox.InboxSlice
import adr.blocks.inbox.InboxView
import adr.blocks.triage.Ticket
import adr.blocks.triage.TriageBlock
import adr.blocks.triage.TriageSlice
import adr.blocks.triage.TriageView
import adr.spine.pure.PanelId
import adr.spine.pure.SpineSlice
import adr.spine.pure.ViewModel

/**
 * Every slice defaults to its own SLICE's `empty`, so plugging a block in is ONE
 * appended field here — a seeding line is needed only for a block that starts non-empty.
 *
 * The default names the slice shape rather than the block, because a data-class default
 * is evaluated before any block exists and a block is now a CONSTRUCTED type rather than
 * a loose `object` standing by at file scope. Nothing is lost: `empty` was already the
 * idiom in inbox, artifact and analysis.
 */
data class State(
    val spine: SpineSlice = SpineSlice(),
    val triage: TriageSlice = TriageSlice(),
    val escalation: EscalationSlice = EscalationSlice(),
    val console: ConsoleSlice = ConsoleSlice(),
    val artifact: ArtifactSlice = ArtifactSlice(),
    /** The tiering rung (11): what this tier recalled, and what it published. */
    val analysis: AnalysisSlice = AnalysisSlice(),
    /** The barge-in rung (12): what was shed while busy, and what failed. */
    val inbox: InboxSlice = InboxSlice(),
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
