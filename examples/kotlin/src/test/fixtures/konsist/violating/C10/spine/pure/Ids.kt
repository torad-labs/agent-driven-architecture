// BLOCK-TEST C10 (G7) — module-level mutable state.
// A top-level `var` is a service locator with the ceremony removed: two callers
// can disagree about it without either being wired to the other, and nothing in
// the composition root knows it exists. It also silently breaks replay, because
// the value is not on the timeline and cannot be re-derived from it.
package adr.spine.pure

var currentSession: String = "session-1"

var stepCounter: Int = 0
