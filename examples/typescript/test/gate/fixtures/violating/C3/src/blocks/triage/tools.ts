// VIOLATION: G9 — a tool body reading the ambient clock.
export function stamp(): number {
  return Date.now();
}
