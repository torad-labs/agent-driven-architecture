// ── app/narrator — the demo's OUTPUT SEAM ─────────────────────────────────
// The walkthrough used to call `println` twenty times. That is the one thing this
// reference tells you never to do: writing to the console is an EFFECT, and an effect
// reached directly is an effect no test can observe and no caller can redirect.
//
// So narration goes through a seam like everything else. The walkthrough is handed a
// Narrator and never learns where its lines go; app/Main.kt — the entry point, and the
// only file in the port permitted to touch the console — binds it to stdout. A test can
// bind a list instead and assert on what the demo SAID, which was impossible before.
//
// A `fun interface`, so the binding stays a lambda at the call site (`Narrator { … }`)
// and costs the root nothing.

package adr.app

fun interface Narrator {
    fun say(line: String)
}
