// ── app/assemble — the THREE total dispatchers (I3) ────────────────────────
//   foldApp            results → (state, effects)     the decision
//   projectApp         state   → AppView              what a human reads (6.9)
//   projectContextApp  state   → Context              what the reasoner reads (F4/G15)
//
// Three, not one, because they consume different things and 6.9 forbids fusing the
// fold with the projections.
//
// Every dispatcher is an EXHAUSTIVE match with NO else arm. Adding a block adds one
// branch to each, and the compiler names every one. Adding a VERB adds nothing here
// at all — that edit lands entirely inside the block (§11.1).

package adr.app

import adr.blocks.analysis.Analysis
import adr.blocks.artifact.Artifact
import adr.blocks.console.Console
import adr.blocks.escalation.Escalation
import adr.blocks.inbox.Inbox
import adr.blocks.triage.Triage
import adr.contract.AnalysisResult
import adr.contract.ArtifactResult
import adr.contract.ConsoleResult
import adr.contract.Effect
import adr.contract.EscalationResult
import adr.contract.InboxResult
import adr.contract.ToolResult
import adr.contract.TriageResult
import adr.spine.pure.Context
import adr.spine.pure.MAX_CONTEXT_NOTICES
import adr.spine.pure.Notice
import adr.spine.pure.Signature
import adr.spine.pure.StagedInput
import adr.spine.pure.Timestamp
import adr.spine.pure.refusedArm
import adr.spine.pure.spineView
import adr.spine.pure.unhandledArm

fun foldApp(
    state: State,
    results: List<ToolResult>,
    now: Timestamp,
    sig: Signature,
): Pair<State, List<Effect>> {
    var s = state
    val effects = mutableListOf<Effect>()
    val notices = mutableListOf<Notice>()

    for (result in results) {
        when (result) {
            is TriageResult -> Triage.arm(s.triage, result, now, sig).let {
                s = s.copy(triage = it.slice)
                effects += it.effects
                notices += it.notices
            }

            is EscalationResult -> Escalation.arm(s.escalation, result, now, sig).let {
                s = s.copy(escalation = it.slice)
                effects += it.effects
                notices += it.notices
            }

            is ConsoleResult -> Console.arm(s.console, result, now, sig).let {
                s = s.copy(console = it.slice)
                effects += it.effects
                notices += it.notices
            }

            is ArtifactResult -> Artifact.arm(s.artifact, result, now, sig).let {
                s = s.copy(artifact = it.slice)
                effects += it.effects
                notices += it.notices
            }

            is AnalysisResult -> Analysis.arm(s.analysis, result, now, sig).let {
                s = s.copy(analysis = it.slice)
                effects += it.effects
                notices += it.notices
            }

            is InboxResult -> Inbox.arm(s.inbox, result, now, sig).let {
                s = s.copy(inbox = it.slice)
                effects += it.effects
                notices += it.notices
            }

            // The spine's own two arms. Identical everywhere (§7).
            is ToolResult.Unhandled -> unhandledArm(s.spine, result, now).let {
                effects += it.effects
                notices += it.notices
            }

            is ToolResult.Refused -> refusedArm(s.spine, result, now).let {
                effects += it.effects
                notices += it.notices
            }
        }
    }

    // Per-item notices land in the spine's slice. RunStatus is NEVER touched here (F9).
    return s.copy(spine = s.spine.withNotices(notices)) to effects.toList()
}

fun projectApp(state: State): AppView = AppView(
    root = spineView(state.spine),
    triage = Triage.view(state.triage),
    escalation = Escalation.view(state.escalation),
    console = Console.view(state.console),
    artifact = Artifact.view(state.artifact),
    analysis = Analysis.view(state.analysis),
    inbox = Inbox.view(state.inbox),
)

/**
 * The THIRD pure projection (G15). Recomputed from committed State every step, never
 * appended to, and bounded by declared constants — so |Context| is O(1) in timeline
 * length. The artifact contributes a COUNT, never its lines.
 */
fun projectContextApp(state: State, staged: List<StagedInput>): Context = Context(
    staged = staged,
    lines = Triage.contextLines(state.triage) +
        Escalation.contextLines(state.escalation) +
        Console.contextLines(state.console) +
        Analysis.contextLines(state.analysis) +
        Inbox.contextLines(state.inbox),
    notices = state.spine.notices
        .takeLast(MAX_CONTEXT_NOTICES)
        .map { "${it.tool.value}: ${it.reason}" },
    artifactLineCount = Artifact.lineCount(state.artifact),
)
