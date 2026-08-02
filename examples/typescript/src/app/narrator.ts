// ── app/narrator — the demo's OUTPUT SEAM ──────────────────────────────────
// The walkthrough used to call `console.log` fourteen times. That is the one thing
// this reference tells you never to do: writing to the console is an EFFECT, and an
// effect reached directly is an effect no test can observe and no caller can redirect.
//
// So narration goes through a seam like everything else. The walkthrough is handed a
// Narrator and never learns where its lines go; app/main.ts — the entry point, and the
// only file in the port permitted to touch the console — binds it to stdout. A test can
// bind an array instead and assert on what the demo SAID, which was impossible before.
//
// A NAMED type with a method, not a bare `(line: string) => void`. A raw function type
// is an anonymous, transposable seam: every other one-string-in/void-out function is
// the same type, nothing implements it by name, and no doc rides it. This is the TS
// twin of the Kotlin port's `fun interface Narrator`.

export interface Narrator {
  say(...parts: readonly unknown[]): void;
}

/** The seam bound to stdout. Called in exactly one place: app/main.ts. */
export function consoleNarrator(): Narrator {
  return {
    // biome-ignore lint/suspicious/noConsole: the ONE place this port reaches stdout
    say: (...parts) => console.log(...parts),
  };
}
