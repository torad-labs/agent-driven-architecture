// COMPLIANT: the loop DECLARES and forwards. It converts a table into rows and
// hands the list it was given onward; every decision belongs to the fold.
package adr.spine.agent

class Loop(
    val onStepFinish: (List<String>) -> List<String> = { calls -> calls.map { it.trim() } },
) {
    fun drive(rows: List<String>): List<String> = rows.map { it.lowercase() }
}
