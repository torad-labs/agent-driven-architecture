// ── ALLOW-TEST for gate check C9 (G12) ────────────────────────────────────
// The same closed set, matched the way the architecture asks: every variant named,
// no `else`. Add `Archived` to the hierarchy and THIS file stops compiling — which
// is the edit list §11.2 promises and the review measured (G12) missing.
//
// Note the second function: a `when` over an OPEN subject (a String) still gets its
// `else`, and the rule leaves it alone. C9 denies catch-alls over closed sets, not
// catch-alls in general — that distinction is why the rule can run tree-wide.
//
// EXPECTED: no findings.

package fixture.compliant.blocks.triage

sealed interface TicketStatus {
    data object Open : TicketStatus

    data object Escalating : TicketStatus

    data object Escalated : TicketStatus

    data object Resolved : TicketStatus
}

fun label(status: TicketStatus): String = when (status) {
    TicketStatus.Open -> "open"
    TicketStatus.Escalating -> "escalating"
    TicketStatus.Escalated -> "escalated"
    TicketStatus.Resolved -> "resolved"
}

/** An OPEN input — 6.10's other half. The guard belongs here, and the rule permits it. */
fun parse(raw: String): TicketStatus? = when (raw) {
    "open" -> TicketStatus.Open
    "escalating" -> TicketStatus.Escalating
    "escalated" -> TicketStatus.Escalated
    "resolved" -> TicketStatus.Resolved
    else -> null
}
