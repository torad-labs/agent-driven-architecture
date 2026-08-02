// COMPLIANT: the attributed list is handed WHOLE to the admission rule, and what
// this file names is the value `admit` handed back.
//
// FOUR SHAPES, each proven ACCEPTED, because the rule this replaces rejected two of
// them: a POSITIONAL construction, a NAMED-ARGUMENT construction, a declaration's
// own KDoc using the word in prose, and a `List<Attributed>` handed whole to the
// rule. CONSTRUCTING an attribution stays legal wherever the fold runs — only
// OPENING one is the admission rule's.

package adr.spine.replay

import adr.contract.Effect
import adr.contract.ToolResult
import adr.spine.pure.Admission
import adr.spine.pure.Attributed

class Derive {

    /** The decision-log lines the triage arm emitted, handed whole to the rule. */
    fun perform(admission: Admission, produced: List<Attributed>): List<Effect> =
        admission.admit(produced)

    /** Positional. What every fold arm writes. */
    fun attribute(from: ToolResult, effect: Effect): Attributed = Attributed(from, effect)

    /** Named-argument. The same construction, spelled the way a reader prefers. */
    fun named(from: ToolResult, effect: Effect): Attributed =
        Attributed(from = from, emitted = effect)
}
