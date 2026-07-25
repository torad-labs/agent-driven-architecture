// ── spine/pure/tool-result — the sealed ROOT of every tool payload ─────────
// The parent declares `tool` ONCE, so every variant that will ever exist carries
// its verb name by construction (L3). The name is the discriminant of ToolResult,
// of Command, and the key of the registry — one name per verb (D3), which is what
// makes 17.6's "the gate keys off names" literally true.
//
// PACKAGE NOTE (§1.5): Kotlin requires every variant of a sealed hierarchy to be
// declared in the same package and module. Blocks contribute cases, so every
// transport declaration in the system — this file, Command.kt, Effect.kt and each
// block's Contract.kt — shares the package `adr.contract` while staying in its own
// folder. That is a documented consequence of L3 plus Kotlin, not an accident;
// gate check C2 compensates by denying cross-block symbols by name prefix.
//
// HARD CONSTRAINT (F2/D4): no ToolResult variant has a field of type Actor,
// Authority or Signature, and none may gain one. A tool asking "who is asking?"
// is asking the wrong question — the answer is stamped after it returns.

package adr.contract

import adr.spine.pure.ToolName

sealed interface ToolResult {
    /** The verb this payload came from. Declared once, carried by every variant. */
    val tool: ToolName

    /**
     * An Action naming no registered verb, or an input that failed to decode.
     * It is FOLDED and COMMITTED like any other result (6.5) — never silently dropped.
     */
    data class Unhandled(override val tool: ToolName, val note: String) : ToolResult

    /**
     * The boundary gate said no (D5). Committed, so a re-fold reproduces the
     * refusal without re-running the authorization check (G9).
     */
    data class Refused(override val tool: ToolName, val reason: String) : ToolResult
}
