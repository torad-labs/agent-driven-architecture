// ── BLOCK-TEST for gate check C9 (G12) ────────────────────────────────────
// A closed set matched with a catch-all. The `else` is exactly how G12's failure
// happens: add `Archived` to the sealed hierarchy and this file keeps compiling,
// the compiler names no edit site, and the projection silently answers "unknown"
// for a status the product cares about.
//
// EXPECTED: detekt.ElseCaseInsteadOfExhaustiveWhen fires.

package fixture.violating.blocks.triage

sealed interface TicketStatus {
    data object Open : TicketStatus

    data object Escalating : TicketStatus

    data object Escalated : TicketStatus

    data object Resolved : TicketStatus
}

fun label(status: TicketStatus): String = when (status) {
    TicketStatus.Open -> "open"
    TicketStatus.Escalating -> "escalating"
    else -> "unknown"
}
