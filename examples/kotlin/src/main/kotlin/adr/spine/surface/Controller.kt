// ── spine/surface/controller — ONE value out, ONE action in (G8) ───────────
// The whole public surface of the system, for a human: an immutable ViewModel to
// render, and one sink to push an Action into. Nothing else.
//
// A person tapping a control and the agent calling a tool resolve to the IDENTICAL
// Command (3.2) — including a presentation verb, because A1 deleted the carve-out
// that made that sentence false.

package adr.spine.surface

import adr.spine.boundary.FinishedStep
import adr.spine.pure.Action
import adr.spine.pure.Actor

class Controller<V>(
    private val viewOf: () -> V,
    private val submit: (FinishedStep) -> Unit,
) {
    /** The one immutable value the surface renders. Every flag is already decided. */
    val view: V get() = viewOf()

    /** The one sink. The surface never folds, never signs and never performs. */
    fun onAction(action: Action) {
        submit(FinishedStep(by = Actor.Human, staged = emptyList(), actions = listOf(action)))
    }
}
