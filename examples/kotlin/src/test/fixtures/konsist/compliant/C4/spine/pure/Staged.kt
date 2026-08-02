// ALLOW-TEST C4(e) — the staged input as the book ships it: a source, a body,
// a key. No stamp, and no field that could hold one.
package adr.spine.pure

sealed class StagedInput(open val source: SourceName) {
    data class Perceived(
        override val source: SourceName,
        val body: String,
        val key: SourceKey,
    ) : StagedInput(source)
}
