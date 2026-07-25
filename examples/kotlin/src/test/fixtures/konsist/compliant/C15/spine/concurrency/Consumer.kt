// ALLOW-TEST C15 — the same machinery, self-contained.
// It speaks only the spine's own vocabulary and the THREE transport roots the spine
// itself owns (ToolResult, Command, Effect). It is generic in the app's State rather
// than naming it — the structural price of "the spine never names a block" — so the
// whole folder can be copied into another repository unchanged.
//
// This is idiomatic, not contorted: it is shorter than the violating version,
// because a tier that names nothing downstream needs fewer imports.
package adr.spine.concurrency

import adr.contract.ToolResult
import adr.spine.pure.SourceName
import adr.spine.pure.ToolName

fun <S> consume(state: S, result: ToolResult, source: SourceName): ToolName =
    ToolName("${state.hashCode()}-${result.tool.value}-${source.value}")
