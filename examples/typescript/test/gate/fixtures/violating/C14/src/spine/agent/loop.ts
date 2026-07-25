// VIOLATION: G3 — the loop is a declaration, not a program.
export function forward(actions: readonly string[]): readonly string[] {
  if (actions.length === 0) {
    return [];
  }
  return actions;
}
