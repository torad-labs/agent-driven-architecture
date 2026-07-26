// ── app/main — the entry point, and NOTHING else ───────────────────────────
// The only file in the port that touches the console.
//
// It used to sit at the bottom of app/demo.ts as `void main()`, which is why that file
// needed to reach `console.log` fourteen times. Splitting it out is what let the
// walkthrough become an ordinary function taking a seam: a test can now bind an array
// Narrator and assert on what the demo SAID.
//
// The TS twin of the Kotlin port's app/Main.kt, for the same reason and with the same
// one-line body.

import { runDemo } from "./demo";
import { consoleNarrator } from "./narrator";

void runDemo(consoleNarrator());
