// ── spine/pure/block — the two roles EVERY block really shares ─────────────
// A block used to be a loose `object` delegating to top-level functions. Neither
// host is constructed, so neither can be stood up on its own: the only way to reach
// `triageArm` was through whatever called it. This interface is the other half of
// the cure — the roles now live on a type the root INSTANTIATES.
//
// It declares TWO roles, not four, and the count is a measurement rather than a
// preference. Across the six shipped blocks:
//
//   arm          6/6   every block folds its own sub-union into its own slice
//   view         6/6   every block projects one slice for a human
//   contextLines 5/6   ARTIFACT has none — it contributes a COUNT, never lines (§5.2)
//   register     5/6   ANALYSIS has THREE, because a tier is an allowlist (11.4)
//
// So `contextLines` and `register` are block-shaped, not Block-shaped, and pinning
// them here would force exactly the per-block special-casing the interface exists to
// avoid. They stay ordinary members of the concrete block type, where the compiler
// still checks them and no block has to pretend to a role it does not have.
//
// This is NOT a bindability seam. Nothing stores a `Block` in a variable: the root's
// three dispatchers match exhaustively over the sealed transport, so every call site
// already knows the concrete slice type (app/Assemble.kt). What the interface buys is that the
// shared half of "every block looks the same" is CHECKED BY THE COMPILER instead of
// asserted in a comment — which is this reference's whole thesis applied to itself.

package adr.spine.pure

import adr.contract.ToolResult

/**
 * The universal half of a block's public surface.
 *
 * [Slice] is the block's own state, [R] its sealed sub-union of the transport, and
 * [View] what a human reads. The spine names none of the three concretely — that is
 * L1, and it is why all three are type parameters rather than imports.
 */
interface Block<Slice, R : ToolResult, View> {

    /**
     * The block's ARM: the pure decision, from committed slice + one result to the
     * next slice, the effects it earned and the notices it left (§7).
     *
     * Every argument varies per call, so none of them is constructor state — which is
     * why the concrete blocks are constructed with an empty argument list.
     */
    fun arm(slice: Slice, result: R, now: Timestamp, sig: Signature): ArmOut<Slice>

    /** The block's PRESENTER: slice → what a human reads (6.9). Total and pure. */
    fun view(slice: Slice): View
}
