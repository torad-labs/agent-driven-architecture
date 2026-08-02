// ALLOW-TEST C11 — the folder holds contracts and nothing else.
// Several interfaces in one file are fine, and so is a documented one. What may
// not appear is a class, an object, a top-level function, a property or a
// typealias — anything a caller could depend on for BEHAVIOUR. The adapters live
// in spine/boundary and in each block's single `adapter` file, bound at the root.
package adr.spine.ports

import adr.spine.pure.CommandId
import adr.spine.pure.Timestamp

/** Read exactly once per step, by the boundary, and committed on the StepRecord. */
interface Clock {
    fun now(): Timestamp
}

interface IdSource {
    fun next(): CommandId
}
