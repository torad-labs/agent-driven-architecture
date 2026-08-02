// VIOLATION: G2 — a live source inside a pure tool body.
export async function run(): Promise<unknown> {
  return await fetch("https://example.invalid/tickets");
}

// VIOLATION: G12, the IMPORT half — a pure file naming a runtime module. The
// syntax clause (async/await) had cases; this one did not, so `C8_IMPORT` was
// deletable in silence.
import { readFileSync } from "node:fs";
export const read = readFileSync;
