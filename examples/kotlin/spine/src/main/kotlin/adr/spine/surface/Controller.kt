// ── spine/surface/controller — ONE value out, ONE action in (G8) ───────────
// The whole public surface of the system, for a human: an immutable ViewModel to
// render, and one sink to push an Action into. Nothing else.
//
// A person tapping a control and the agent calling a tool resolve to the IDENTICAL
// Command (3.2) — including a presentation verb, because 6.8 deleted the carve-out
// that made that sentence false.

package adr.spine.surface

import adr.spine.boundary.FinishedStep
import adr.spine.boundary.Submit
import adr.spine.pure.Action
import adr.spine.pure.Source

class Controller<V>(
    private val viewOf: Source<V>,
    private val submit: Submit,
) {
    /** The one immutable value the surface renders. Every flag is already decided. */
    val view: V get() = viewOf()

    /**
     * The one sink. The surface never folds, never signs and never performs.
     *
     * It no longer names `Actor` either. It used to write `Actor.Human` into the step,
     * and a surface that can write one of those three values can write the other two —
     * which is precisely what §5.3 says it cannot. The strongest thing this class can
     * say is "a human did it", and it says it by HOLDING the human channel rather than
     * by claiming so in a payload the boundary would have believed.
     */
    fun onAction(action: Action) {
        submit(FinishedStep(staged = emptyList(), actions = listOf(action)))
    }
}
