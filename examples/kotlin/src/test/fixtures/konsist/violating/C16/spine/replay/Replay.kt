// VIOLATION: G6 — the fold's ATTRIBUTED output opened outside the admission rule.
// The DOTTED property read, which on the live tree is also a COMPILE error because
// `Attributed` holds both halves privately. That is the point of the pair: the
// language is the wall, and this rule is the TRIPWIRE that fires the moment a
// future author widens the visibility back out.
//
// Two spellings a Kotlin author has that no text rule could safely see are absent
// on purpose and closed by the language instead: `with(a) { emitted }` needs a
// visible member, and `val (_, e) = a` needs `componentN()`, which a non-data
// class does not ship.

package adr.spine.replay

import adr.contract.Effect
import adr.spine.pure.Attributed

class Leak {

    fun dotted(attributed: Attributed): Effect = attributed.emitted

    fun spaced(attributed: Attributed): Effect = attributed. emitted
}
