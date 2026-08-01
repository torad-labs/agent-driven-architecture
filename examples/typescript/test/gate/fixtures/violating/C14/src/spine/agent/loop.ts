// VIOLATION: G3 — the loop is a declaration, not a program.
export function forward(actions: readonly string[]): readonly string[] {
  if (actions.length === 0) {
    return [];
  }
  return actions;
}

// VIOLATION: G3 again, one level down — an EXPRESSION decides too. A ternary
// passed the first shipping of this rule (statement nodes only) with the whole
// gate green; the G3 cell promises the build fails at the FIRST decision point.
export function pick(actions: readonly string[]): string {
  return actions.length > 0 ? "run" : "idle";
}

// VIOLATION: a logical chain is the same decision in a third spelling.
export function fallback(primary: string | undefined, alt: string): string {
  return primary || alt;
}
