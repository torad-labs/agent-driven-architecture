// BLOCK-TEST C8 (G2) — a tool that reads the world.
// the review measured (15.2) an `fs` import in the domain shipping green. This is the same
// shape, plus the Kotlin-specific half: a `suspend` tool body. Seam 07's own named
// violation is caught HERE and not by the replay harness, which structurally
// cannot see it — the review measured (G9) that an injected impure tool passed replayTest,
// because the harness never invoked a tool at all.
package adr.blocks.triage

import adr.spine.pure.ToolName
import java.net.URL

suspend fun fetchPriority(name: ToolName): String = URL("https://example/priority").readText()
