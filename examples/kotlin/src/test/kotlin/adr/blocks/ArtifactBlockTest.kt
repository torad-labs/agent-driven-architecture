// ── test/blocks/artifact — F6: the artifact is compared BY VALUE ──────────
// The regression the old shape could not catch: a reducer change that corrupts
// artifact content while leaving State byte-identical. Impossible now, because the
// content IS State.

package adr.blocks

import adr.app.RunAuthority
import adr.app.World
import adr.app.Env
import adr.app.Wiring
import adr.blocks.artifact.ArtifactBlock
import adr.blocks.artifact.ArtifactLine
import adr.blocks.artifact.ArtifactSlice
import adr.blocks.artifact.CONFIRM_SEAL
import adr.blocks.artifact.RECORD_FINDING
import adr.blocks.artifact.REQUEST_SEAL
import adr.blocks.artifact.SealStatus
import adr.contract.ArtifactEffect
import adr.contract.ArtifactResult
import adr.driveCanonicalSession
import adr.human
import adr.spine.pure.Actor
import adr.spine.pure.Authority
import adr.spine.pure.Signature
import adr.spine.pure.Timestamp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ArtifactBlockTest {

    private val now = Timestamp(9)
    private val author = Signature(Actor.Agent, Authority("agent-run-7f"))
    private val confirmer = Signature(Actor.Human, Authority("host:marcos"))

    /** The block is CONSTRUCTED here — no root, no registry, no boundary (G13). */
    private val block = ArtifactBlock()

    @Test
    fun `a finding is FOLDED as a line - no effect is performed`() {
        val out = block.arm(
            ArtifactSlice(),
            ArtifactResult.RecordFinding(RECORD_FINDING, "refund never issued"),
            now,
            author,
        )

        assertEquals(listOf(ArtifactLine(now, Actor.Agent, "refund never issued")), out.slice.lines)
        assertTrue(out.effects.isEmpty(), "the work product is state, not a pile of effects")
    }

    @Test
    fun `delivery is ONE irreversible effect at seal time`() {
        val drafted = block.arm(
            ArtifactSlice(),
            ArtifactResult.RecordFinding(RECORD_FINDING, "first"),
            now,
            author,
        ).slice
        val sealing = block.arm(drafted, ArtifactResult.RequestSeal(REQUEST_SEAL), now, author).slice
        assertIs<SealStatus.Sealing>(sealing.seal)

        val sealed = block.arm(sealing, ArtifactResult.ConfirmSeal(CONFIRM_SEAL), now, confirmer)

        assertIs<SealStatus.Sealed>(sealed.slice.seal)
        assertEquals(
            listOf(ArtifactEffect.DeliverArtifact(now, listOf(ArtifactLine(now, Actor.Agent, "first")))),
            sealed.effects,
        )
    }

    @Test
    fun `a confirm with no requested seal mutates nothing and delivers nothing`() {
        val out = block.arm(ArtifactSlice(), ArtifactResult.ConfirmSeal(CONFIRM_SEAL), now, confirmer)

        assertEquals(ArtifactSlice(), out.slice)
        assertTrue(out.effects.isEmpty())
        assertEquals("no seal has been requested", out.notices.single().reason)
    }

    @Test
    fun `F6 - end to end, the artifact re-folds by VALUE and delivers exactly once`() {
        val world = World()
        val authority = RunAuthority()
        val app = Wiring().wireApp(Env(world = world, authority = authority))

        app.human(RECORD_FINDING, "text" to "first")
        app.driveCanonicalSession(authority)

        assertEquals(
            listOf("first", "refund was never issued"),
            app.state.artifact.lines.map { it.text },
        )
        assertIs<SealStatus.Sealed>(app.state.artifact.seal)
        assertEquals(1, app.performed.count { it.effect is ArtifactEffect.DeliverArtifact })
        assertEquals(1, world.deliveries.size)
    }
}
