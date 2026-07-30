// ── spine/pure/seams — the NAMED function seams ────────────────────────────
// A raw function type is an anonymous, transposable seam. `(S) -> TriageSlice` and
// `(S) -> Int` are different types by accident of their shape, while `(S) -> Slice`
// and any other one-argument reader are the SAME type — so nothing can implement one
// by name, no KDoc rides it, and a test double can only be a lambda. Naming the seam
// fixes all three and costs nothing at the call site: `operator fun invoke` keeps
// `lens(state)` reading as it did, and SAM conversion keeps `{ it.triage }` binding.
//
// These live in spine/pure because the spine declares the shapes and the blocks and
// the root supply them — the direction every other seam in this architecture points.

package adr.spine.pure

import adr.contract.ToolResult

/**
 * ONE STEP OF SCHEMA EVOLUTION (14.7): a historical payload in, a current-shape
 * ToolResult out. Declared here with the other seams because the spine names the
 * shape and the APP supplies it — the spine may not name a block (C15), and every
 * old payload shape belongs to one.
 */
fun interface UpcastResult<R> {
    operator fun invoke(old: R): ToolResult
}

/**
 * A block's window onto its OWN slice of the app's State (G11). The block never learns
 * what else State holds; the root hands it this and nothing more.
 */
fun interface Lens<S, T> {
    operator fun invoke(state: S): T
}

/** A read of something the caller does not own — the state, the context, the staging. */
fun interface Source<T> {
    operator fun invoke(): T
}

/** What the consumer reports upward, mapped to Actions by the root (12). */
fun interface Report<E> {
    operator fun invoke(event: E): List<Action>
}

/** A one-value writer at the edge of the system: an adapter's way out to the world. */
fun interface Emit<T> {
    operator fun invoke(value: T)
}
