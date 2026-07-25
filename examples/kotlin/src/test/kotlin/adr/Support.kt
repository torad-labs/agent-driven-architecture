// ── test support — how a test drives the system ────────────────────────────
// Two entry points, exactly as the architecture has: the human surface
// (Controller.onAction) and the agent path (Boundary.onStepFinish with Actor.Agent).
// Nothing here reaches around the boundary.

package adr

import adr.app.App
import adr.app.RunAuthority
import adr.blocks.artifact.CONFIRM_SEAL
import adr.blocks.artifact.RECORD_FINDING
import adr.blocks.artifact.REQUEST_SEAL
import adr.blocks.escalation.CONFIRM_ESCALATION
import adr.blocks.escalation.REQUEST_ESCALATION
import adr.blocks.triage.SET_PRIORITY
import adr.spine.boundary.FinishedStep
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.SourceName
import adr.spine.pure.StagedInput
import adr.spine.pure.ToolName
import adr.spine.pure.rawOf

/** The human path: one Action through the surface. */
fun App.human(tool: ToolName, vararg fields: Pair<String, String>) {
    controller.onAction(Action(tool, rawOf(*fields)))
}

/** The agent path: one finished step carrying the model's raw input. */
fun App.agent(
    tool: ToolName,
    vararg fields: Pair<String, String>,
    staged: List<StagedInput> = emptyList(),
) {
    boundary.onStepFinish(
        FinishedStep(
            by = Actor.Agent,
            staged = staged,
            actions = listOf(Action(tool, rawOf(*fields))),
        ),
    )
}

/** Run one step under a specific principal — a policy tier, a reviewer, an approval queue. */
fun App.under(authority: RunAuthority, principal: String, body: App.() -> Unit) {
    authority.acting = Authority(principal)
    body()
    authority.acting = null
}

/**
 * The canonical session §8.3 replays: a priority change, a request, a refused
 * self-confirm, a granted unattended confirm, a finding, a seal request and a
 * granted seal confirm.
 */
fun App.driveCanonicalSession(authority: RunAuthority) {
    // One step carries a staged off-bus input, so the fixture 5.4 requires be captured
    // is exercised end to end and round-trips through the committed record.
    agent(
        SET_PRIORITY,
        "ticket" to "4118",
        "level" to "Normal",
        staged = listOf(
            StagedInput.Perceived(SourceName("inbox"), "customer says the refund never arrived"),
        ),
    )
    human(SET_PRIORITY, "ticket" to "4118", "level" to "High")
    human(REQUEST_ESCALATION, "ticket" to "4118")
    human(CONFIRM_ESCALATION, "ticket" to "4118") // same principal → refused at the gate
    under(authority, "policy-tier-v3") { human(CONFIRM_ESCALATION, "ticket" to "4118") }
    human(RECORD_FINDING, "text" to "refund was never issued")
    human(REQUEST_SEAL)
    under(authority, "policy-tier-v3") { human(CONFIRM_SEAL) }
}
