// ALLOW-TEST C4 — Ctx as shipped: the committed snapshot, and the bounded
// projection the reasoner also saw. No actor, no authority, no Signature.
package adr.spine.pure

data class Ctx<S>(val state: S, val context: Context)
