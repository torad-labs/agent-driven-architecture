// The idiomatic shape, and the one the whole tree is written in: every variant
// named, and a `default` that can only ever hold `never`. Add a fifth variant
// and this file stops compiling — which is what 15.4 means by "the compiler
// hands you the edit list".
type TicketStatus =
  | { readonly kind: "Open" }
  | { readonly kind: "Escalating" }
  | { readonly kind: "Escalated" }
  | { readonly kind: "Resolved" };

export function label(status: TicketStatus): string {
  switch (status.kind) {
    case "Open":
      return "open";
    case "Escalating":
      return "escalating";
    case "Escalated":
      return "escalated";
    case "Resolved":
      return "resolved";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}
