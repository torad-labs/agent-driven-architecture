// BLOCK-TEST C4(e) — a staged input that could CARRY authority.
// 11.2's whole claim is "recall confers no authority BY CONSTRUCTION": the
// field's absence IS the guarantee, so the field's presence is the violation.
// An injected relay entry demanding an irreversible confirmation is refused at
// the gate precisely because a Recalled has nothing that could answer it.
package adr.spine.pure

sealed class StagedInput(open val source: SourceName) {
    data class Recalled(
        override val source: SourceName,
        val text: String,
        val authority: Authority,
    ) : StagedInput(source)
}
