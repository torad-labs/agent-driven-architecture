// ── The view projection: the Presenter (seam 04) ────────────────────────────
// Pure. Pre-decides every presentational flag onto a separate ViewModel type.
// The surface applies these flags; it never computes them.

package adr

data class TicketRow(
    val ticket: String,
    val badge: String,        // pre-computed, e.g. "HIGH"
    val canEscalate: Boolean, // decided HERE, not in the view
    val escalating: Boolean,
    val focused: Boolean,
)

data class ConsoleView(
    val rows: List<TicketRow>,
    val banner: String,
)

private fun badgeFor(p: Priority): String = p.name.uppercase()

fun State.project(): ConsoleView {
    val rows = tickets.values.map { t ->
        TicketRow(
            ticket = t.id,
            badge = badgeFor(t.priority),
            canEscalate = t.status is TicketStatus.Open,
            escalating = t.status is TicketStatus.Escalating,
            focused = focused == t.id,
        )
    }
    val banner = (this.run as? RunStatus.Degraded)?.let { "degraded: ${it.cause}" } ?: "ok"
    return ConsoleView(rows = rows, banner = banner)
}
