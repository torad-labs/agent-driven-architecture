// VIOLATION: G3 — the loop is a declaration, not a program.
//
// Written as the LIVE IDIOM: the decision sits in a lambda passed as a
// constructor argument, which is exactly where detekt's CyclomaticComplexMethod
// cannot see it (it measures named functions). A review shipped all four of
// these into the real agent loop with the whole Kotlin gate green.
package adr.spine.agent

class Loop(
    val onStepFinish: (List<String>) -> List<String> = { calls ->
        // an if/else
        if (calls.isEmpty()) {
            emptyList()
        } else {
            // a when
            when (calls.size) {
                1 -> calls
                2 -> calls.reversed()
                else -> calls.take(1)
            }
        }
    },
) {
    // a for loop and an elvis, in an ordinary named function
    fun drive(rows: List<String>?): List<String> {
        val safe = rows ?: emptyList()
        val out = mutableListOf<String>()
        for (row in safe) out += row
        return out
    }
}
