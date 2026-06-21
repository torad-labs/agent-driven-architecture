// ── The inner ring: entities (seam 01) ──────────────────────────────────────
// Pure domain types and pure state transitions. No I/O, no framework, no clock.
// State is a discriminated-union value; every transition returns a NEW State.

package adr

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class Actor { Human, Agent }

@Serializable
enum class Priority { Low, Normal, High, Urgent }

@Serializable
sealed interface TicketStatus {
    @Serializable @SerialName("Open") data object Open : TicketStatus
    @Serializable @SerialName("Escalating") data class Escalating(val by: Actor) : TicketStatus
    @Serializable @SerialName("Escalated") data object Escalated : TicketStatus
    @Serializable @SerialName("Resolved") data object Resolved : TicketStatus
}

@Serializable
data class Ticket(
    val id: String,
    val body: String,
    val priority: Priority,
    val status: TicketStatus,
)

@Serializable
sealed interface RunStatus {
    @Serializable @SerialName("Idle") data object Idle : RunStatus
    @Serializable @SerialName("Working") data object Working : RunStatus
    @Serializable @SerialName("Degraded") data class Degraded(val cause: String) : RunStatus
    @Serializable @SerialName("Error") data class Error(val fault: String) : RunStatus
}

// The whole world the core knows about. A value: structural equality is what
// makes replay's "fold twice, assert identical" a meaningful claim.
data class State(
    val tickets: Map<String, Ticket>,
    val focused: String?,
    val run: RunStatus,
) {
    companion object {
        fun initial(tickets: List<Ticket> = emptyList()): State =
            State(
                tickets = tickets.associateBy { it.id },
                focused = null,
                run = RunStatus.Idle,
            )
    }
}

// ── Pure transitions — copy-on-write, never mutate the input ─────────────────

fun State.withPriority(ticket: String, level: Priority): State {
    val t = tickets[ticket] ?: return withUnhandled("priority for unknown ticket $ticket")
    return copy(tickets = tickets + (ticket to t.copy(priority = level)))
}

fun State.withStatus(ticket: String, status: TicketStatus): State {
    val t = tickets[ticket] ?: return withUnhandled("status for unknown ticket $ticket")
    return copy(tickets = tickets + (ticket to t.copy(status = status)))
}

fun State.withFocus(ticket: String): State = copy(focused = ticket)

fun State.withUnhandled(note: String): State = copy(run = RunStatus.Degraded(note))
