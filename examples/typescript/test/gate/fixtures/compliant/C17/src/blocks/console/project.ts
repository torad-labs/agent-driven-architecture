/**
 * COMPLIANT: MATCHING an Irreversible leaf stays legal everywhere — a closed
 * `switch`, a comparison and a type position are all reads, not constructions.
 *
 * This KDoc-shaped comment names PageOncall("nope") in PROSE on purpose: a rule
 * that fired on a declaration-attached comment would be exactly the nuisance
 * §15.2 warns about, and the check is written against the parse tree, so prose
 * cannot trip it.
 */
export function label(effect: { readonly kind: string }): string {
  switch (effect.kind) {
    case "PageOncall":
      return "paged";
    default:
      return effect.kind === "PageOncall" ? "paged" : "other";
  }
}
