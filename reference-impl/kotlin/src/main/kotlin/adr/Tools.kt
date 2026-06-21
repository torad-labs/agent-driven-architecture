// ── The two kinds of tool (seam 03) ─────────────────────────────────────────
// A tool is pure: run(input, ctx) -> ToolResult. It reads the read-only context,
// returns a payload, and mutates nothing. UI tools and domain tools have the
// identical shape — everything is a tool, even the UI.

package adr

import kotlinx.serialization.Serializable

// The agent context: read-only ambient input the boundary stages before a step.
data class Ctx(
    val state: State, // a read-only snapshot — the tool never writes it
    val actor: Actor, // who is acting (stamped by the boundary)
)

interface Tool<I> {
    val name: String
    fun run(input: I, ctx: Ctx): ToolResult
}

// Tool inputs — @Serializable so the SDK can decode the model's JSON arguments.
@Serializable
data class SetPriorityInput(val ticket: String, val level: Priority)

@Serializable
data class TicketInput(val ticket: String)

// Domain tools — advance business logic.
val setPriority: Tool<SetPriorityInput> = object : Tool<SetPriorityInput> {
    override val name = "setPriority"
    override fun run(input: SetPriorityInput, ctx: Ctx): ToolResult =
        ToolResult.PrioritySet(ticket = input.ticket, level = input.level)
}

val requestEscalation: Tool<TicketInput> = object : Tool<TicketInput> {
    override val name = "requestEscalation"
    override fun run(input: TicketInput, ctx: Ctx): ToolResult =
        ToolResult.EscalationRequested(ticket = input.ticket, by = ctx.actor)
}

val confirmEscalation: Tool<TicketInput> = object : Tool<TicketInput> {
    override val name = "confirmEscalation"
    override fun run(input: TicketInput, ctx: Ctx): ToolResult =
        ToolResult.EscalationConfirmed(ticket = input.ticket, by = ctx.actor)
}

// A UI tool — drives the surface. Same pure shape as a domain tool.
val focusTicket: Tool<TicketInput> = object : Tool<TicketInput> {
    override val name = "focusTicket"
    override fun run(input: TicketInput, ctx: Ctx): ToolResult =
        ToolResult.Focused(ticket = input.ticket, known = ctx.state.tickets.containsKey(input.ticket))
}
