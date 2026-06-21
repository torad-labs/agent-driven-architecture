// ── The signed action (seam 02) ─────────────────────────────────────────────
// A human tap and an agent tool-call become the SAME Command, differing only by
// `by: Actor`. Everything — even a UI focus — is a command on one bus.

package adr

sealed interface Command {
    val by: Actor
    val id: String
    val ticket: String

    data class SetPriority(
        override val by: Actor,
        override val id: String,
        override val ticket: String,
        val level: Priority,
    ) : Command

    data class RequestEscalation(
        override val by: Actor,
        override val id: String,
        override val ticket: String,
    ) : Command

    data class ConfirmEscalation(
        override val by: Actor,
        override val id: String,
        override val ticket: String,
    ) : Command

    data class FocusTicket(
        override val by: Actor,
        override val id: String,
        override val ticket: String,
    ) : Command
}
