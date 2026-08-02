// COMPLIANT: MATCHING an Irreversible leaf stays legal everywhere — `is X ->` is a
// read, not a construction, which is the line C7's banner already draws.

package adr.blocks.triage

import adr.contract.Effect
import adr.contract.EscalationEffect

class Label {
    /**
     * Names PageOncall("nope") in PROSE, on a declaration's own KDoc, on purpose: a
     * rule that fired on a comment would be exactly the nuisance 15.2 warns about,
     * and `codeText` includes declaration KDoc. The rule matches the leaf's in-scope
     * CONSTRUCTION spellings, and a sentence is not one of them.
     */
    fun label(effect: Effect): String = when (effect) {
        is EscalationEffect.PageOncall -> "paged"
        else -> "other"
    }
}
