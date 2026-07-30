// ── spine/ports/model-provider — the cognition seam ────────────────────────
// The port is parameterised in the model type ON PURPOSE: spine/agent/loop is the
// only file in the system that is allowed to know what M actually is, so the
// runtime's types never leak inward (G4).

package adr.spine.ports

interface ModelProvider<M> {
    fun model(): M
}
