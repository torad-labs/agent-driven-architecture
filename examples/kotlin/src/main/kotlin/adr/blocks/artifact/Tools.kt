// ── blocks/artifact/tools — the Verb table ─────────────────────────────────
//   recordFinding  Reversible    appends one line. NO effect.
//   requestSeal    Reversible    Draft → Sealing. NO effect — a request is reversible.
//   confirmSeal    Irreversible  Sealing → Sealed, plus EXACTLY ONE DeliverArtifact.
//
// Sealing the session is 14.3's canonical irreversible action, so it is gated by the
// same boundary check as paging on-call — the same mechanic, not a special case.

package adr.blocks.artifact

import adr.contract.ArtifactCommand
import adr.contract.ArtifactResult
import adr.spine.pure.RawInput
import adr.spine.pure.ToolName
import adr.spine.pure.Verb
import adr.spine.pure.text

val RECORD_FINDING = ToolName("recordFinding")
val REQUEST_SEAL = ToolName("requestSeal")
val CONFIRM_SEAL = ToolName("confirmSeal")

data class FindingInput(val text: String)

data object NoInput

private fun decodeFinding(raw: RawInput): FindingInput? = raw.text("text")?.let { FindingInput(it) }

private fun decodeNothing(raw: RawInput): NoInput = NoInput

fun <S> artifactVerbs(lens: (S) -> ArtifactSlice): List<Verb<S, *, *>> = listOf(
    Verb.Reversible(
        name = RECORD_FINDING,
        describe = "Record one finding as a line in the session's work product.",
        decode = ::decodeFinding,
        run = { input, _ -> ArtifactResult.RecordFinding(RECORD_FINDING, input.text) },
        sign = { r, sig, id -> ArtifactCommand.RecordFinding(r.tool, sig, id, r.text) },
    ),
    Verb.Reversible(
        name = REQUEST_SEAL,
        describe = "Request that the work product be sealed and delivered. Reversible.",
        decode = ::decodeNothing,
        run = { _, _ -> ArtifactResult.RequestSeal(REQUEST_SEAL) },
        sign = { r, sig, id -> ArtifactCommand.RequestSeal(r.tool, sig, id) },
    ),
    Verb.Irreversible(
        name = CONFIRM_SEAL,
        describe = "Confirm the seal. IRREVERSIBLE: it delivers the work product.",
        decode = ::decodeNothing,
        run = { _, _ -> ArtifactResult.ConfirmSeal(CONFIRM_SEAL) },
        sign = { r, sig, id -> ArtifactCommand.ConfirmSeal(r.tool, sig, id) },
        requestedBy = { state, _ ->
            (lens(state).seal as? SealStatus.Sealing)?.requestedBy
        },
    ),
)
