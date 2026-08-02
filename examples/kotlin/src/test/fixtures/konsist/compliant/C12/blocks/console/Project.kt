// ALLOW-TEST C12, the other half — the ONE file that may see the ephemeral state.
// Ephemeral local state joins the pre-decided ViewModel at the very last moment,
// in the projection, where losing it costs nothing. This is the whole point of the
// rule: it does not delete the concept, it confines it to the one file where it is
// harmless.
package adr.blocks.console

data class ConsoleView(val focused: String?, val hovered: String?, val draft: String)

fun consoleView(slice: ConsoleSlice, ephemeral: ViewState): ConsoleView = ConsoleView(
    focused = slice.focused,
    hovered = ephemeral.hover,
    draft = ephemeral.draft,
)
