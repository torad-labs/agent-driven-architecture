// ── The loop is a declaration (seam 06/07, the runtime binding) ─────────────
// This is the ONLY file that touches the agent-loop runtime (aisdk-kotlin).
// It wraps the pure tools as SDK tools and hooks the boundary onto the agent's
// `onStepFinish` — that callback IS the boundary seam. No domain logic lives here.

package adr

import ai.torad.aisdk.LanguageModel
import ai.torad.aisdk.ToolLoopAgent
import ai.torad.aisdk.ToolSet
import ai.torad.aisdk.decodeAs
import ai.torad.aisdk.stepCountIs
import ai.torad.aisdk.tool
import ai.torad.aisdk.toolSetOf
import kotlinx.serialization.serializer

// Wrap each pure tool as an SDK tool. The executor runs the pure tool against a
// read-only Ctx built from the boundary's current state and returns the payload.
// NOTE: confirmEscalation is deliberately NOT exposed to the agent — the
// irreversible confirm is a host/out-of-band action. The gate also holds in the
// fold, so even a forged agent confirm would be denied.
fun buildTools(boundary: Boundary): ToolSet<Unit> {
    fun ctx(): Ctx = Ctx(state = boundary.state, actor = Actor.Agent)
    return toolSetOf(
        tool<SetPriorityInput, ToolResult, Unit>(
            name = "setPriority",
            description = "Set a support ticket's priority (Low | Normal | High | Urgent).",
            inputSerializer = serializer(),
            outputSerializer = serializer(),
        ) { input -> setPriority.run(input, ctx()) },
        tool<TicketInput, ToolResult, Unit>(
            name = "requestEscalation",
            description = "Request escalation of a ticket. Reversible; does NOT page on-call.",
            inputSerializer = serializer(),
            outputSerializer = serializer(),
        ) { input -> requestEscalation.run(input, ctx()) },
        tool<TicketInput, ToolResult, Unit>(
            name = "focusTicket",
            description = "Bring a ticket into focus on the console.",
            inputSerializer = serializer(),
            outputSerializer = serializer(),
        ) { input -> focusTicket.run(input, ctx()) },
    )
}

// The agent IS a declaration: a named subclass binding the model + the tool
// surface + the stop condition + the boundary. The runtime drives the loop; the
// boundary folds each step's tool results. The SDK serializes each tool's output
// onto ContentPart.ToolResult.output; here we decode it back to a domain
// ToolResult and hand it to the boundary, stamped with the literal Actor.Agent
// (so the agent can never forge Actor.Human).
class TriageAgent(
    model: LanguageModel,
    private val boundary: Boundary,
) : ToolLoopAgent<Unit, String>(
    model = model,
    instructions =
        "You triage support tickets. Use the tools to set a ticket's priority, " +
            "request an escalation, or focus a ticket on the console.",
    tools = buildTools(boundary),
    stopWhen = stepCountIs(8),
    onStepFinish = {
        val results = step.toolResults.mapNotNull { tr ->
            runCatching { tr.output.decodeAs<ToolResult>() }.getOrNull()
        }
        if (results.isNotEmpty()) {
            boundary.onStepFinish(FinishedStep(actor = Actor.Agent, results = results))
        }
    },
)

data class TurnOutcome(val steps: Int, val text: String)

// Run one agent turn-chain. The runtime drives the loop; the boundary (wired via
// onStepFinish in the constructor) folds each step's tool results as they finish.
suspend fun TriageAgent.runTurn(prompt: String): TurnOutcome {
    val result = generate(prompt = prompt)
    return TurnOutcome(steps = result.steps.size, text = result.text)
}
