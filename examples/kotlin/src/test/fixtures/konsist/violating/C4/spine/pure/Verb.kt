// BLOCK-TEST C4 (F2/D4), third half — Ctx hands the stamp to the tool.
// §2.3: deleting ctx.actor is what makes an Actor unrepresentable upstream. Put
// it back and every tool in the system can branch on it again.
package adr.spine.pure

data class Ctx<S>(val state: S, val context: Context, val actor: Actor)
