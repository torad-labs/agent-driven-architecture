// ── app/main — the entry point, and NOTHING else ──────────────────────────
// The only file in the port that touches the console, and the only one that blocks.
//
// Both are entry-point privileges the rule pack recognises BY NAME:
// no-runblocking-in-production already exempted `**/Main.kt`, and
// no-runblocking-in-common's own message says "runBlocking belongs only at composition
// roots or tests" — it had simply never implemented its own sentence until this file
// forced the question. no-println-in-production now carries the same narrow carve-out,
// because a console application must reach the console somewhere and the front door is
// the honest place for it.
//
// Each exemption is worth exactly one line here, and that is the point: everything
// downstream writes through app/Narrator.kt and never learns where its lines go, so the
// walkthrough stayed an ordinary constructed type with no privileges of its own.
//
// This used to sit at the top of app/Demo.kt, which is why that file needed the
// privileges too. Splitting it out is what let the demo become testable.

package adr.app

import kotlinx.coroutines.runBlocking

fun main(): Unit = runBlocking {
    Demo(Narrator { line -> println(line) }).run()
}
