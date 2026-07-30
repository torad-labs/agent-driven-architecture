// ── spine/agent/loop — the loop is a DECLARATION (G3) ──────────────────
// The ONLY file in spine/ that imports the agent-loop runtime (aisdk-kotlin). It
// does two things and nothing else:
//
//   1. it declares one SDK tool per registered Verb — the verb TABLE is the tool
//      surface, so adding a verb touches no file here (16.1);
//   2. it forwards each finished step's raw tool CALLS to the boundary as Actions.
//
// It forwards ACTIONS, NOT RESULTS. That is what makes spine/boundary/action the
// single production site of every ToolResult in the system (gate check C7), so a
// recorded result can never disagree with what the boundary folded. It also means a
// decode failure becomes a folded, committed ToolResult.Unhandled instead of a
// silently dropped step.
//
// There is no `if`, no `for`, no `while` and no `try` in this file (gate check C14).
// A loop with control flow in it is a loop with policy in it.

package adr.spine.agent

import adr.spine.boundary.FinishedStep
import adr.spine.boundary.Submit
import adr.spine.pure.Action
import adr.spine.pure.Actor
import adr.spine.pure.Context
import adr.spine.pure.Ctx
import adr.spine.pure.RawInput
import adr.spine.pure.Registry
import adr.spine.pure.Source
import adr.spine.pure.StagedInput
import adr.spine.pure.ToolName
import adr.spine.pure.Verb
import ai.torad.aisdk.LanguageModel
import ai.torad.aisdk.Tool
import ai.torad.aisdk.ToolLoopAgent
import ai.torad.aisdk.stepCountIs
import ai.torad.aisdk.tool
import ai.torad.aisdk.toolSetOf
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.serializer

/**
 * Declare one SDK tool from one Verb.
 *
 * NOTE — THE PURE TOOL BODY RUNS TWICE PER AGENT ACTION (§15 risk 4). Once here, so
 * the model gets a payload-rich result to reason over; once at the boundary, to
 * produce the recorded truth. A pure function evaluated twice is free, and that is
 * the price of ONE production site for ToolResult.
 */
class SdkToolSurface<S>(
    private val stateOf: Source<S>,
    private val contextOf: Source<Context>,
) {
  fun toolFor(verb: Verb<S, *, *>): Tool<JsonObject, JsonElement, Unit> = tool(
    name = verb.name.value,
    description = verb.describe,
    inputSerializer = serializer(),
    outputSerializer = serializer(),
) { input ->
    // ONE call, no branch. `modelEcho` is a pure function in spine/pure/verb, because
    // deciding what to say when an input fails to decode is a decision, and G3 keeps
    // decisions out of the loop. Gate check C14 is what holds that line.
    JsonPrimitive(verb.modelEcho(RawInput(input), Ctx(stateOf(), contextOf())))
  }
}

/**
 * The agent IS a declaration: a named subclass binding the model, the tool surface
 * built from the verb table, the stop condition, and the boundary.
 */
class AgentLoop<S>(
    model: LanguageModel,
    instructions: String,
    registry: Registry<S>,
    stateOf: Source<S>,
    contextOf: Source<Context>,
    stagedOf: Source<List<StagedInput>>,
    submit: Submit,
) : ToolLoopAgent<Unit, String>(
    model = model,
    instructions = instructions,
    tools = toolSetOf(
        *SdkToolSurface(stateOf, contextOf)
            .let { surface -> registry.values.map(surface::toolFor) }
            .toTypedArray(),
    ),
    stopWhen = stepCountIs(8),
    onStepFinish = {
        // The model's RAW input, forwarded verbatim. The boundary decides what it means.
        // `stagedOf()` is the staging seam: the ORDERED off-bus inputs this step consumed —
        // what the world offered (EventSource) and, when a barge-in consumer is driving the
        // turn, the peer tier's recall it already bounded. Both are captured on the
        // committed record and projected into the Context (5.4). The loop chooses nothing;
        // it forwards the list it is handed, which is why C14 stays satisfiable here.
        step.toolCalls
            .takeIf { it.isNotEmpty() }
            ?.map { Action(ToolName(it.toolName), RawInput(it.input)) }
            ?.let { submit(FinishedStep(by = Actor.Agent, staged = stagedOf(), actions = it)) }
    },
) {
    /**
     * Run one agent turn-chain. The runtime drives the loop; the boundary folds each
     * step. A MEMBER, not an extension: an extension dispatches statically and has no
     * instance, so `runTurn` could never be overridden by a test double of the loop.
     */
    suspend fun runTurn(prompt: String): TurnResult {
        val result = generate(prompt = prompt)
        return TurnResult(steps = result.steps.size, text = result.text)
    }
}

/**
 * What the RUNTIME returned from one turn-chain: how many steps it took and what it
 * said. Distinct from `spine/pure/turn`'s sealed `TurnOutcome`, which is how a turn
 * ENDED as far as the barge-in consumer is concerned (ok / threw / cancelled / idle).
 * Two different questions, so two different types.
 */
data class TurnResult(val steps: Int, val text: String)


