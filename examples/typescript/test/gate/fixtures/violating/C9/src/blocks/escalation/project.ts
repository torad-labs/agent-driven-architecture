// VIOLATION: G12 — an open default is not a closed match.
// This is the exact shape the shipped reference shipped: three of the four
// variants go unhandled, `default` swallows them, and so adding a FIFTH changes
// nothing — the compiler hands you no edit list.
type TicketStatus =
  | { readonly kind: "Open" }
  | { readonly kind: "Escalating" }
  | { readonly kind: "Escalated" }
  | { readonly kind: "Resolved" };

export function label(status: TicketStatus): string {
  switch (status.kind) {
    case "Open":
      return "open";
    default:
      return "other";
  }
}
