// VIOLATION: G2 — a live source inside a pure tool body.
export async function run(): Promise<unknown> {
  return await fetch("https://example.invalid/tickets");
}
