export function forward(actions: readonly string[]): readonly string[] {
  return actions.filter((a) => a.length > 0);
}
