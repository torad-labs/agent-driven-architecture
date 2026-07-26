// ── spine/pure/emit — the one-value writer seam ────────────────────────────
// An adapter's way out to the world, NAMED. `(line: string) => void` is anonymous and
// transposable: every other one-string-in/void-out function is the same type, so
// nothing implements it by name and no doc rides it.
//
// Blocks declare that they need one; the composition root supplies it. An adapter that
// defaulted the parameter to `console.log` bound an effect INSIDE the block, which is
// the coupling app/wire exists to prevent — and it made the block untestable without
// capturing stdout.

export interface Emit {
  (line: string): void;
}
