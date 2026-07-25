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
import adr.spine.pure.RawInput

/**
 * THE TEST DRIVER, as a constructed type.
 *
 * These four were top-level extensions on App. Test sources are in scope for the law
 * (no-loose-top-level-fun ignores build/, node_modules/, dist/ and *.gradle.kts, and
 * nothing else), and deliberately so: an untestable helper is not excused by living
 * next to the tests, and an extension is the least substitutable shape there is —
 * static dispatch, no instance, no override.
 */
class Driver {

    /** The human path: one Action through the surface. */
    fun human(
        app: App,tool: ToolName, vararg fields: Pair<String, String>) {
        app.controller.onAction(Action(tool, RawInput(*fields)))
    }

    /** The agent path: one finished step carrying the model's raw input. */
    fun agent(
        app: App,
        tool: ToolName,
        vararg fields: Pair<String, String>,
        staged: List<StagedInput> = emptyList(),
    ) {
        app.boundary.onStepFinish(
            FinishedStep(
                by = Actor.Agent,
                staged = staged,
                actions = listOf(Action(tool, RawInput(*fields))),
            ),
        )
    }

    /** Run one step under a specific principal — a policy tier, a reviewer, an approval queue. */
    fun under(app: App, authority: RunAuthority, principal: String, body: () -> Unit) {
        authority.acting = Authority(principal)
        body()
        authority.acting = null
    }

    /**
     * The canonical session §8.3 replays: a priority change, a request, a refused
     * self-confirm, a granted unattended confirm, a finding, a seal request and a
     * granted seal confirm.
     */
    fun driveCanonicalSession(
        app: App,
        authority: RunAuthority,
    ) {
        // One step carries a staged off-bus input, so the fixture 5.4 requires be captured
        // is exercised end to end and round-trips through the committed record.
        agent(
            app,
            SET_PRIORITY,
            "ticket" to "4118",
            "level" to "Normal",
            staged = listOf(
                StagedInput.Perceived(SourceName("inbox"), "customer says the refund never arrived"),
            ),
        )
        human(app, SET_PRIORITY, "ticket" to "4118", "level" to "High")
        human(app, REQUEST_ESCALATION, "ticket" to "4118")
        human(app, CONFIRM_ESCALATION, "ticket" to "4118") // same principal → refused at the gate
        under(app, authority, "policy-tier-v3") { human(app, CONFIRM_ESCALATION, "ticket" to "4118") }
        human(app, RECORD_FINDING, "text" to "refund was never issued")
        human(app, REQUEST_SEAL)
        under(app, authority, "policy-tier-v3") { human(app, CONFIRM_SEAL) }
    }
}
